import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TranscribeOptions {
  recordingUrl: string;
  communicationId?: string;
  onSuccess?: (transcript: string) => void;
}

export function useTranscribeRecording() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  const transcribe = async ({ recordingUrl, communicationId, onSuccess }: TranscribeOptions) => {
    if (!recordingUrl) {
      toast.error("No recording URL provided");
      return null;
    }

    setIsTranscribing(true);

    try {
      const { data, error } = await supabase.functions.invoke('transcribe-call-recording', {
        body: { recordingUrl, communicationId }
      });

      if (error) {
        console.error('Transcription error:', error);
        
        if (error.message?.includes('429')) {
          toast.error("Rate limit exceeded. Please try again later.");
        } else if (error.message?.includes('402')) {
          toast.error("Payment required. Please add credits to continue.");
        } else {
          toast.error("Failed to transcribe recording");
        }
        return null;
      }

      if (data?.transcript) {
        setTranscript(data.transcript);
        toast.success("Recording transcribed successfully");
        onSuccess?.(data.transcript);
        return data.transcript;
      } else {
        toast.error("No transcript generated");
        return null;
      }
    } catch (err) {
      console.error('Transcription error:', err);
      toast.error("Failed to transcribe recording");
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    transcribe,
    isTranscribing,
    transcript,
    setTranscript
  };
}

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranscribeRecording } from "@/hooks/use-transcribe-recording";
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  RotateCcw,
  Download,
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles
} from "lucide-react";

interface CallRecordingPlayerProps {
  recordingUrl: string;
  transcript?: string | null;
  compact?: boolean;
  communicationId?: string;
  onTranscriptGenerated?: (transcript: string) => void;
}

export function CallRecordingPlayer({ 
  recordingUrl, 
  transcript: initialTranscript, 
  compact = false,
  communicationId,
  onTranscriptGenerated
}: CallRecordingPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [localTranscript, setLocalTranscript] = useState<string | null>(initialTranscript || null);
  
  const { transcribe, isTranscribing } = useTranscribeRecording();

  // Update local transcript when prop changes
  useEffect(() => {
    if (initialTranscript) {
      setLocalTranscript(initialTranscript);
    }
  }, [initialTranscript]);

  const handleTranscribe = async () => {
    const result = await transcribe({
      recordingUrl,
      communicationId,
      onSuccess: (transcript) => {
        setLocalTranscript(transcript);
        onTranscriptGenerated?.(transcript);
      }
    });
    if (result) {
      setShowTranscript(true);
    }
  };

  const transcript = localTranscript;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      setError("Failed to load recording");
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [recordingUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (isPlaying) {
        audio.pause();
      } else {
        await audio.play();
      }
      setIsPlaying(!isPlaying);
    } catch (err) {
      console.error('Error playing audio:', err);
      setError("Failed to play recording");
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const restart = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    setCurrentTime(0);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = recordingUrl;
    link.download = `call-recording-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="text-sm text-destructive flex items-center gap-2 p-2 bg-destructive/10 rounded-md">
        <VolumeX className="h-4 w-4" />
        {error}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <audio ref={audioRef} src={recordingUrl} preload="metadata" />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={togglePlay}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <span className="text-xs text-muted-foreground min-w-[60px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
            disabled={isLoading}
            title="Download recording"
          >
            <Download className="h-4 w-4" />
          </Button>
          {!transcript && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleTranscribe}
              disabled={isTranscribing || isLoading}
              title="Transcribe with AI"
            >
              {isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          )}
          {transcript && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowTranscript(!showTranscript)}
              title={showTranscript ? "Hide transcript" : "Show transcript"}
            >
              <FileText className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {/* Compact Transcript Display */}
        {transcript && showTranscript && (
          <div className="p-2 bg-muted/30 rounded-md border text-xs">
            <p className="text-muted-foreground whitespace-pre-wrap line-clamp-4">{transcript}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
      <audio ref={audioRef} src={recordingUrl} preload="metadata" />
      
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 rounded-full"
          onClick={togglePlay}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        <div className="flex-1 space-y-1">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            disabled={isLoading || duration === 0}
            className="cursor-pointer"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={restart}
            disabled={isLoading}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleMute}
            disabled={isLoading}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
            disabled={isLoading}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Transcribe Button - show when no transcript */}
      {!transcript && (
        <div className="border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={handleTranscribe}
            disabled={isTranscribing || isLoading}
          >
            {isTranscribing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Transcribe with AI
              </>
            )}
          </Button>
        </div>
      )}

      {/* Transcript Section */}
      {transcript && (
        <div className="border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-sm font-medium"
            onClick={() => setShowTranscript(!showTranscript)}
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Call Transcript
            </span>
            {showTranscript ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          
          {showTranscript && (
            <ScrollArea className="h-[150px] mt-2">
              <div className="p-3 bg-background rounded-md text-sm whitespace-pre-wrap">
                {transcript}
              </div>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}

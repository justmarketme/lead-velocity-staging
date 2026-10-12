/**
 * "Take photo" and "Choose file" for the intro-card headshot, on phones and computers.
 * - Phones (coarse pointer) or no camera API: Take photo = <input type=file accept="image/*" capture="user"> (opens the
 *   front camera); Choose file = <input accept="image/*"> (gallery / files).
 * - Computers: Take photo opens a webcam dialog (getUserMedia) with a Capture button; if the camera is blocked or missing it
 *   falls back to the file picker and says why.
 * Every result goes through prepareHeadshot(): one upright JPEG ≤ 1600 px, which broker-media accepts.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeadshotError, prepareHeadshot } from "@/lib/imagePrep";

const btn = "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60";

export default function HeadshotPicker({ disabled, onPicked, onError, primaryClass, secondaryClass }: {
  disabled?: boolean;
  onPicked: (file: File) => void;
  onError: (message: string | null) => void;
  primaryClass?: string;
  secondaryClass?: string;
}) {
  const camInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (stream && video.current) { video.current.srcObject = stream; void video.current.play().catch(() => undefined); }
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [stream]);

  async function handle(blob: Blob | null | undefined, name?: string) {
    if (!blob) return;
    setBusy(true); onError(null);
    try {
      onPicked(await prepareHeadshot(blob, name));
    } catch (e) {
      onError(e instanceof HeadshotError ? e.message : "We couldn't use that photo. Please try another one.");
    } finally {
      setBusy(false);
    }
  }

  const phone = () => typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || !navigator.mediaDevices?.getUserMedia);

  async function takePhoto() {
    onError(null);
    if (phone()) { camInput.current?.click(); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      setStream(s);
    } catch (e) {
      const denied = (e as { name?: string })?.name === "NotAllowedError";
      onError(denied ? "Camera access was blocked. Allow the camera for this site, or choose a photo file instead." : "No camera found. Choose a photo file instead.");
      fileInput.current?.click();
    }
  }

  function closeCamera() { stream?.getTracks().forEach((t) => t.stop()); setStream(null); }

  async function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.translate(c.width, 0); ctx.scale(-1, 1); // the preview is mirrored like a selfie; save what the broker saw
    ctx.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.92));
    closeCamera();
    await handle(blob, "camera.jpg");
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={disabled || busy} onClick={takePhoto} className={`${btn} ${primaryClass || "bg-white text-slate-950 hover:bg-slate-200"}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}Take photo
        </button>
        <button type="button" disabled={disabled || busy} onClick={() => { onError(null); fileInput.current?.click(); }} className={`${btn} ${secondaryClass || "border border-white/15 text-white hover:bg-white/10"}`}>
          <ImageIcon className="h-4 w-4" />Choose file
        </button>
      </div>
      {/* capture="user": phones open the front camera directly */}
      <input ref={camInput} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { void handle(e.target.files?.[0], e.target.files?.[0]?.name); e.target.value = ""; }} />
      <input ref={fileInput} type="file" accept="image/*,.heic,.heif" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { void handle(e.target.files?.[0], e.target.files?.[0]?.name); e.target.value = ""; }} />

      <Dialog open={!!stream} onOpenChange={(o) => { if (!o) closeCamera(); }}>
        <DialogContent className="max-w-lg z-[120]">
          <DialogHeader>
            <DialogTitle>Take your photo</DialogTitle>
            <DialogDescription>Plain background, look at the camera, shoulders up.</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-2xl bg-black aspect-square">
            <video ref={video} playsInline muted className="h-full w-full object-cover -scale-x-100" aria-label="Camera preview" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={closeCamera} className={`${btn} border border-border`}><X className="h-4 w-4" />Cancel</button>
            <button type="button" onClick={() => void capture()} className={`${btn} bg-primary text-primary-foreground`}><Camera className="h-4 w-4" />Capture</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

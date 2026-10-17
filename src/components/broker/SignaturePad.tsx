import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  /** Returns a PNG data URL, or null if nothing has been drawn. */
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  /** Fired whenever the drawn state changes (true = has a signature). */
  onChange?: (hasDrawing: boolean) => void;
  className?: string;
}

/**
 * Lightweight, dependency-free signature pad.
 * Supports mouse + touch (pointer events) so it works on desktop and mobile.
 */
const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(({ onChange, className }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Size the canvas backing store to its CSS box (for crisp lines on HiDPI).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f172a";
    }
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!dirty.current) {
      dirty.current = true;
      setEmpty(false);
      onChange?.(true);
    }
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    dirty.current = false;
    setEmpty(true);
    onChange?.(false);
  };

  useImperativeHandle(ref, () => ({
    toDataURL: () => (dirty.current ? canvasRef.current?.toDataURL("image/png") ?? null : null),
    clear,
    isEmpty: () => !dirty.current,
  }));

  return (
    <div className={className}>
      <div className="relative rounded-lg border border-input bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="h-40 w-full touch-none rounded-lg"
          style={{ touchAction: "none" }}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Draw your signature here
          </span>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={empty}>
          <Eraser className="mr-1.5 h-3.5 w-3.5" /> Clear
        </Button>
      </div>
    </div>
  );
});

SignaturePad.displayName = "SignaturePad";

export default SignaturePad;

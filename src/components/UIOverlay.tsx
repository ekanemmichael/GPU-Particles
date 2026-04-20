import { Slider } from '@/components/ui/slider';
import { RotateCcw, Video, VideoOff, Loader2, Hand, Grab, Sparkles } from 'lucide-react';
import type { HandGesture } from '@/hooks/useHandTracking';

interface UIOverlayProps {
  isTracking: boolean;
  isLoading: boolean;
  cameraError: string | null;
  fps: number;
  nodeCount: number;
  edgeCount: number;
  handCount: number;
  gestures: HandGesture[];
  forceStrength: number;
  influenceRadius: number;
  springStiffness: number;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onForceStrengthChange: (v: number) => void;
  onInfluenceRadiusChange: (v: number) => void;
  onSpringChange: (v: number) => void;
  onReset: () => void;
  onRetryCamera: () => void;
}

const GESTURE_META: Record<HandGesture, { label: string; icon: typeof Hand }> = {
  none: { label: 'Pull', icon: Hand },
  fist: { label: 'Squeeze', icon: Grab },
  open: { label: 'Scatter', icon: Sparkles },
};

export default function UIOverlay({
  isTracking,
  isLoading,
  cameraError,
  fps,
  nodeCount,
  edgeCount,
  handCount,
  gestures,
  forceStrength,
  influenceRadius,
  springStiffness,
  onStartCamera,
  onStopCamera,
  onForceStrengthChange,
  onInfluenceRadiusChange,
  onSpringChange,
  onReset,
  onRetryCamera,
}: UIOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* ── Top bar: stats ── */}
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="stat-badge">
          FPS <span className="stat-value">{fps}</span>
        </div>
        <div className="stat-badge">
          Nodes <span className="stat-value">{nodeCount}</span>
        </div>
        <div className="stat-badge">
          Edges <span className="stat-value">{edgeCount.toLocaleString()}</span>
        </div>
        <div className="stat-badge">
          Hands <span className="stat-value">{handCount}/2</span>
        </div>
        {gestures.map((g, i) => {
          const meta = GESTURE_META[g];
          const Icon = meta.icon;
          return (
            <div key={i} className="stat-badge">
              <Icon className="w-3 h-3" />
              <span className="stat-value">
                {i === 0 ? 'L' : 'R'} · {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Control panel ── */}
      <div className="absolute top-4 right-4 w-64 glass-panel p-4 space-y-4 pointer-events-auto">
        <div>
          {!isTracking ? (
            <button
              onClick={onStartCamera}
              disabled={isLoading}
              className="glow-button w-full flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading model…
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  Start Camera
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onStopCamera}
              className="glow-button-outline w-full flex items-center justify-center gap-2"
            >
              <VideoOff className="w-4 h-4" />
              Stop Camera
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="control-label">Pull Force</span>
            <span className="font-mono text-xs text-primary">{forceStrength.toFixed(1)}</span>
          </div>
          <Slider
            value={[forceStrength]}
            onValueChange={([v]) => onForceStrengthChange(v)}
            min={1}
            max={20}
            step={0.5}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="control-label">Reach</span>
            <span className="font-mono text-xs text-primary">{influenceRadius.toFixed(1)}</span>
          </div>
          <Slider
            value={[influenceRadius]}
            onValueChange={([v]) => onInfluenceRadiusChange(v)}
            min={1}
            max={8}
            step={0.25}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="control-label">Snap-back</span>
            <span className="font-mono text-xs text-primary">{springStiffness.toFixed(1)}</span>
          </div>
          <Slider
            value={[springStiffness]}
            onValueChange={([v]) => onSpringChange(v)}
            min={1}
            max={15}
            step={0.5}
          />
        </div>

        <button
          onClick={onReset}
          className="glow-button-outline w-full flex items-center justify-center gap-2 text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Network
        </button>

        <p className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t border-border/40">
          Move both palms to bend the network. <span className="text-primary">Fist</span> to squeeze nodes together,
          <span className="text-accent-foreground"> open palm</span> to scatter them.
        </p>
      </div>

      {/* Camera error banner */}
      {cameraError && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 max-w-md pointer-events-auto">
          <div className="error-banner space-y-3">
            <p className="text-sm">{cameraError}</p>
            <button onClick={onRetryCamera} className="glow-button text-xs">
              Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

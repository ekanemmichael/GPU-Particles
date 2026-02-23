import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Hand, RotateCcw, Video, VideoOff, Loader2 } from 'lucide-react';

interface UIOverlayProps {
  isTracking: boolean;
  isLoading: boolean;
  cameraError: string | null;
  fps: number;
  particleCount: number;
  attractMode: boolean;
  forceStrength: number;
  influenceRadius: number;
  isPinching: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onToggleMode: (attract: boolean) => void;
  onForceStrengthChange: (v: number) => void;
  onInfluenceRadiusChange: (v: number) => void;
  onReset: () => void;
  onRetryCamera: () => void;
}

export default function UIOverlay({
  isTracking,
  isLoading,
  cameraError,
  fps,
  particleCount,
  attractMode,
  forceStrength,
  influenceRadius,
  isPinching,
  onStartCamera,
  onStopCamera,
  onToggleMode,
  onForceStrengthChange,
  onInfluenceRadiusChange,
  onReset,
  onRetryCamera,
}: UIOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* ── Top bar: stats ── */}
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-auto">
        <div className="stat-badge">
          FPS <span className="stat-value">{fps}</span>
        </div>
        <div className="stat-badge">
          Particles <span className="stat-value">{particleCount.toLocaleString()}</span>
        </div>
        {isPinching && (
          <div className="stat-badge">
            <Hand className="w-3 h-3" />
            <span className="stat-value">Pinch</span>
          </div>
        )}
      </div>

      {/* ── Control panel (top-right) ── */}
      <div className="absolute top-4 right-4 w-64 glass-panel p-4 space-y-4 pointer-events-auto">
        {/* Camera toggle */}
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

        {/* Mode toggle */}
        <div className="flex items-center justify-between">
          <span className="control-label">
            {attractMode ? 'Attract' : 'Repel'}
          </span>
          <Switch
            checked={attractMode}
            onCheckedChange={onToggleMode}
          />
        </div>

        {/* Force strength */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="control-label">Force</span>
            <span className="font-mono text-xs text-primary">{forceStrength.toFixed(1)}</span>
          </div>
          <Slider
            value={[forceStrength]}
            onValueChange={([v]) => onForceStrengthChange(v)}
            min={0.5}
            max={15}
            step={0.5}
          />
        </div>

        {/* Influence radius */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="control-label">Radius</span>
            <span className="font-mono text-xs text-primary">{influenceRadius.toFixed(1)}</span>
          </div>
          <Slider
            value={[influenceRadius]}
            onValueChange={([v]) => onInfluenceRadiusChange(v)}
            min={0.5}
            max={6}
            step={0.25}
          />
        </div>

        {/* Reset */}
        <button
          onClick={onReset}
          className="glow-button-outline w-full flex items-center justify-center gap-2 text-xs"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Particles
        </button>
      </div>

      {/* ── Camera error banner ── */}
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

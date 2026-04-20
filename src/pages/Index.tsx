/**
 * Main page: wires together the GPU particle system, hand tracking, and UI overlay.
 *
 * Gestures:
 *  - Pointing: index finger tip drives the attraction point
 *  - Pinch: strong focused pull (grab)
 *  - Fist: strong attract + tight radius (squeeze / gather)
 *  - Open palm: repel / scatter
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ParticleSystem } from '@/lib/particleSystem';
import { useHandTracking, type HandGesture } from '@/hooks/useHandTracking';
import UIOverlay from '@/components/UIOverlay';

const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const particleRef = useRef<ParticleSystem | null>(null);
  const rafRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  const [fps, setFps] = useState(0);
  const [attractMode, setAttractMode] = useState(true);
  const [forceStrength, setForceStrength] = useState(8.0);
  const [influenceRadius, setInfluenceRadius] = useState(4.0);
  const [gesture, setGesture] = useState<HandGesture>('none');

  const {
    isTracking,
    isLoading,
    cameraError,
    handDataRef,
    videoRef,
    videoReady,
    startCamera,
    stopCamera,
    detect,
    setCameraError,
  } = useHandTracking();

  // Attach the MediaStream from the hook's hidden video to the visible <video> element
  useEffect(() => {
    const src = videoRef.current?.srcObject as MediaStream | null;
    if (videoElRef.current && src) {
      videoElRef.current.srcObject = src;
      videoElRef.current.play().catch(() => {});
    } else if (videoElRef.current && !src) {
      videoElRef.current.srcObject = null;
    }
  }, [videoReady, videoRef]);

  // Store current values in refs for animation loop (avoids stale closures)
  const attractRef = useRef(attractMode);
  const forceRef = useRef(forceStrength);
  const radiusRef = useRef(influenceRadius);
  useEffect(() => { attractRef.current = attractMode; }, [attractMode]);
  useEffect(() => { forceRef.current = forceStrength; }, [forceStrength]);
  useEffect(() => { radiusRef.current = influenceRadius; }, [influenceRadius]);

  // Initialize particle system
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ps = new ParticleSystem(canvas);
    particleRef.current = ps;

    const onResize = () => {
      ps.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      ps.dispose();
      particleRef.current = null;
    };
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    rafRef.current = requestAnimationFrame(animate);

    const ps = particleRef.current;
    if (!ps) return;

    detect();

    const hand = handDataRef.current;
    if (hand.indexTip) {
      const bounds = ps.getWorldBounds();
      const worldX = hand.indexTip.x * (bounds.right - bounds.left) + bounds.left;
      const worldY = (1 - hand.indexTip.y) * (bounds.top - bounds.bottom) + bounds.bottom;
      ps.setHandPosition(worldX, worldY, true);

      // Map gesture → physics
      // Base values come from sliders; gesture modulates them
      let forceMult = 1.0;
      let radiusMult = 1.0;
      let attract = attractRef.current;

      switch (hand.gesture) {
        case 'pinch':
          forceMult = 3.0;
          radiusMult = 0.7;
          attract = true;
          break;
        case 'fist':
          // Squeeze — strong pull into a tight area
          forceMult = 4.0;
          radiusMult = 0.55;
          attract = true;
          break;
        case 'open':
          // Scatter — push particles away
          forceMult = 2.2;
          radiusMult = 1.4;
          attract = false;
          break;
        default:
          break;
      }

      ps.setForceStrength(forceRef.current * forceMult);
      ps.setInfluenceRadius(radiusRef.current * radiusMult);
      ps.setAttractMode(attract);
      setGesture(hand.gesture);
    } else {
      ps.setHandPosition(999, 999, false);
      ps.setForceStrength(forceRef.current);
      ps.setInfluenceRadius(radiusRef.current);
      ps.setAttractMode(attractRef.current);
      setGesture('none');
    }

    ps.update();

    frameCountRef.current++;
    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, [detect, handDataRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleRetry = useCallback(() => {
    setCameraError(null);
    startCamera();
  }, [setCameraError, startCamera]);

  const handleReset = useCallback(() => {
    particleRef.current?.resetParticles();
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      {/* Webcam background — mirrored, dimmed for contrast */}
      <video
        ref={videoElRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          transform: 'scaleX(-1)',
          opacity: videoReady ? 0.55 : 0,
          filter: 'saturate(0.8) contrast(1.05)',
          transition: 'opacity 400ms ease',
        }}
      />
      {/* Dark vignette so particles stay readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, hsl(var(--background) / 0.25) 0%, hsl(var(--background) / 0.75) 100%)',
        }}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <UIOverlay
        isTracking={isTracking}
        isLoading={isLoading}
        cameraError={cameraError}
        fps={fps}
        particleCount={particleRef.current?.particleCount ?? 50176}
        attractMode={attractMode}
        forceStrength={forceStrength}
        influenceRadius={influenceRadius}
        gesture={gesture}
        onStartCamera={startCamera}
        onStopCamera={stopCamera}
        onToggleMode={setAttractMode}
        onForceStrengthChange={setForceStrength}
        onInfluenceRadiusChange={setInfluenceRadius}
        onReset={handleReset}
        onRetryCamera={handleRetry}
      />
    </div>
  );
};

export default Index;

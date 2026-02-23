/**
 * Main page: wires together the GPU particle system, hand tracking, and UI overlay.
 *
 * Animation loop flow:
 * 1. Run hand detection on the latest video frame
 * 2. Map detected hand coordinates to particle simulation world space
 * 3. Pass hand position as a uniform to the GPU compute shader
 * 4. GPU compute shader updates all 20k+ particle positions/velocities in parallel
 * 5. Render shader reads position texture and draws particles as glowing point sprites
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ParticleSystem } from '@/lib/particleSystem';
import { useHandTracking } from '@/hooks/useHandTracking';
import UIOverlay from '@/components/UIOverlay';

const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleRef = useRef<ParticleSystem | null>(null);
  const rafRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  const [fps, setFps] = useState(0);
  const [attractMode, setAttractMode] = useState(true);
  const [forceStrength, setForceStrength] = useState(5.0);
  const [influenceRadius, setInfluenceRadius] = useState(2.5);
  const [isPinching, setIsPinching] = useState(false);

  const {
    isTracking,
    isLoading,
    cameraError,
    handDataRef,
    startCamera,
    stopCamera,
    detect,
    setCameraError,
  } = useHandTracking();

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

    // Handle resize
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

    // Run hand detection for this frame
    detect();

    // Map hand coordinates to world space and pass to particle system
    const hand = handDataRef.current;
    if (hand.indexTip) {
      const bounds = ps.getWorldBounds();
      const worldX = hand.indexTip.x * (bounds.right - bounds.left) + bounds.left;
      const worldY = (1 - hand.indexTip.y) * (bounds.top - bounds.bottom) + bounds.bottom;
      ps.setHandPosition(worldX, worldY, true);

      // Pinch gesture multiplies force for a "grab" feel
      const pinchMult = hand.isPinching ? 3.0 : 1.0;
      ps.setForceStrength(forceRef.current * pinchMult);
      setIsPinching(hand.isPinching);
    } else {
      ps.setHandPosition(999, 999, false);
      ps.setForceStrength(forceRef.current);
      setIsPinching(false);
    }

    ps.setAttractMode(attractRef.current);
    ps.setInfluenceRadius(radiusRef.current);

    // Update and render
    ps.update();

    // FPS counter
    frameCountRef.current++;
    const now = performance.now();
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, [detect, handDataRef]);

  // Start animation loop
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
    <div className="relative w-full h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <UIOverlay
        isTracking={isTracking}
        isLoading={isLoading}
        cameraError={cameraError}
        fps={fps}
        particleCount={particleRef.current?.particleCount ?? 20736}
        attractMode={attractMode}
        forceStrength={forceStrength}
        influenceRadius={influenceRadius}
        isPinching={isPinching}
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

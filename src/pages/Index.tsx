/**
 * Main page: neural-network visualization driven by two-hand tracking.
 *
 * Each detected palm becomes a soft attractor that bends the network.
 *  - default (loose hand): gentle pull
 *  - fist: strong squeeze (tighter radius, stronger force)
 *  - open palm: repel / scatter
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NeuralNetwork, type Hand2D } from '@/lib/neuralNetwork';
import { useHandTracking, type HandGesture } from '@/hooks/useHandTracking';
import UIOverlay from '@/components/UIOverlay';

const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElRef = useRef<HTMLVideoElement>(null);
  const netRef = useRef<NeuralNetwork | null>(null);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());

  const [fps, setFps] = useState(0);
  const [forceStrength, setForceStrength] = useState(8.0);
  const [influenceRadius, setInfluenceRadius] = useState(4.0);
  const [springStiffness, setSpringStiffness] = useState(6.0);
  const [gestures, setGestures] = useState<HandGesture[]>([]);
  const [handCount, setHandCount] = useState(0);

  const {
    isTracking,
    isLoading,
    cameraError,
    handsDataRef,
    videoRef,
    videoReady,
    startCamera,
    stopCamera,
    detect,
    setCameraError,
  } = useHandTracking();

  // Mirror MediaStream onto the visible <video> element
  useEffect(() => {
    const src = videoRef.current?.srcObject as MediaStream | null;
    if (videoElRef.current && src) {
      videoElRef.current.srcObject = src;
      videoElRef.current.play().catch(() => {});
    } else if (videoElRef.current && !src) {
      videoElRef.current.srcObject = null;
    }
  }, [videoReady, videoRef]);

  // Refs for animation loop (avoid stale closures)
  const forceRef = useRef(forceStrength);
  const radiusRef = useRef(influenceRadius);
  const springRef = useRef(springStiffness);
  useEffect(() => { forceRef.current = forceStrength; }, [forceStrength]);
  useEffect(() => { radiusRef.current = influenceRadius; }, [influenceRadius]);
  useEffect(() => { springRef.current = springStiffness; }, [springStiffness]);

  // Init network
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const net = new NeuralNetwork(canvas);
    netRef.current = net;

    const onResize = () => net.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      net.dispose();
      netRef.current = null;
    };
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    rafRef.current = requestAnimationFrame(animate);
    const net = netRef.current;
    if (!net) return;

    detect();

    const now = performance.now();
    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
    lastTimeRef.current = now;

    const bounds = net.getWorldBounds();
    const detected = handsDataRef.current.hands;

    const hands: Hand2D[] = detected.map(h => {
      let strengthMult = 1;
      let radiusMult = 1;
      let attract = true;
      switch (h.gesture) {
        case 'fist':
          strengthMult = 2.5;
          radiusMult = 0.65;
          attract = true;
          break;
        case 'open':
          strengthMult = 1.6;
          radiusMult = 1.4;
          attract = false;
          break;
      }
      return {
        x: h.palm.x * (bounds.right - bounds.left) + bounds.left,
        y: (1 - h.palm.y) * (bounds.top - bounds.bottom) + bounds.bottom,
        active: true,
        strength: forceRef.current * strengthMult,
        radius: radiusRef.current * radiusMult,
        attract,
      };
    });

    net.springStiffness = springRef.current;
    net.update(dt, hands, now / 1000);

    // Sync UI state once per render
    setGestures(detected.map(h => h.gesture));
    setHandCount(detected.length);

    // FPS
    frameCountRef.current++;
    if (now - lastFpsTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }
  }, [detect, handsDataRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  const handleRetry = useCallback(() => {
    setCameraError(null);
    startCamera();
  }, [setCameraError, startCamera]);

  const handleReset = useCallback(() => {
    netRef.current?.reset();
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      {/* Webcam background */}
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
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, hsl(var(--background) / 0.25) 0%, hsl(var(--background) / 0.75) 100%)',
        }}
      />

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <UIOverlay
        isTracking={isTracking}
        isLoading={isLoading}
        cameraError={cameraError}
        fps={fps}
        nodeCount={netRef.current?.nodeCount ?? 0}
        edgeCount={netRef.current?.edgeCount ?? 0}
        handCount={handCount}
        gestures={gestures}
        forceStrength={forceStrength}
        influenceRadius={influenceRadius}
        springStiffness={springStiffness}
        onStartCamera={startCamera}
        onStopCamera={stopCamera}
        onForceStrengthChange={setForceStrength}
        onInfluenceRadiusChange={setInfluenceRadius}
        onSpringChange={setSpringStiffness}
        onReset={handleReset}
        onRetryCamera={handleRetry}
      />
    </div>
  );
};

export default Index;

/**
 * Hand Tracking Hook using MediaPipe Hands — TWO-HAND support.
 *
 * For each detected hand we expose:
 *  - palm position (average of wrist + middle MCP) for attractor placement
 *  - simple gesture: 'fist' (squeeze), 'open' (scatter/repel), or 'none' (gentle pull)
 *
 * Coordinates are normalized 0..1 with x mirrored for a selfie view.
 */

import { useCallback, useRef, useState } from 'react';

export type HandGesture = 'none' | 'fist' | 'open';

export interface SingleHand {
  /** Normalized palm position, x mirrored for selfie view */
  palm: { x: number; y: number };
  gesture: HandGesture;
}

export interface HandsData {
  hands: SingleHand[];
}

export function useHandTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const handsDataRef = useRef<HandsData>({ hands: [] });
  const lastVideoTimeRef = useRef(-1);

  // Smoothed palm positions, keyed by index in the result array (0 or 1)
  const smoothed = useRef<Array<{ x: number; y: number } | null>>([null, null]);
  const SMOOTHING = 0.15;

  const [videoReady, setVideoReady] = useState(false);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setCameraError(null);

    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    videoRef.current = null;
    if (handLandmarkerRef.current) {
      try { handLandmarkerRef.current.close(); } catch { /* noop */ }
      handLandmarkerRef.current = null;
    }
    setVideoReady(false);

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      videoRef.current = video;

      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      handLandmarkerRef.current = handLandmarker;

      setVideoReady(true);
      setIsTracking(true);
      setIsLoading(false);
    } catch (err: any) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      videoRef.current = null;
      setVideoReady(false);
      setIsLoading(false);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow access and try again.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Please connect a webcam.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Camera is in use by another app or tab. Close it and try again.');
      } else {
        setCameraError(`Camera error: ${err.message ?? err.name ?? 'unknown'}`);
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    videoRef.current = null;
    setVideoReady(false);
    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close();
      handLandmarkerRef.current = null;
    }
    handsDataRef.current = { hands: [] };
    smoothed.current = [null, null];
    lastVideoTimeRef.current = -1;
    setIsTracking(false);
  }, []);

  const detect = useCallback(() => {
    const video = videoRef.current;
    const detector = handLandmarkerRef.current;
    if (!video || !detector || video.readyState < 2) return;

    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;

    try {
      const results = detector.detectForVideo(video, performance.now());
      const landmarksList = results.landmarks ?? [];

      const hands: SingleHand[] = [];

      for (let h = 0; h < landmarksList.length && h < 2; h++) {
        const lm = landmarksList[h];
        const wrist = lm[0];
        const midMcp = lm[9];

        // Palm = midpoint of wrist & middle MCP
        const rawX = 1 - (wrist.x + midMcp.x) * 0.5; // mirror
        const rawY = (wrist.y + midMcp.y) * 0.5;

        const prev = smoothed.current[h];
        if (prev) {
          prev.x += (rawX - prev.x) * (1 - SMOOTHING);
          prev.y += (rawY - prev.y) * (1 - SMOOTHING);
        } else {
          smoothed.current[h] = { x: rawX, y: rawY };
        }
        const palm = smoothed.current[h]!;

        // ── Gesture: fist vs open palm ──
        const palmSize = Math.hypot(midMcp.x - wrist.x, midMcp.y - wrist.y) || 0.0001;
        const tipIdx = [8, 12, 16, 20];
        const pipIdx = [6, 10, 14, 18];
        let extended = 0, curled = 0;
        for (let i = 0; i < tipIdx.length; i++) {
          const tip = lm[tipIdx[i]];
          const pip = lm[pipIdx[i]];
          const tipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y) / palmSize;
          const pipToWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y) / palmSize;
          if (tipToWrist > pipToWrist + 0.15) extended++;
          if (tipToWrist < pipToWrist + 0.02) curled++;
        }

        let gesture: HandGesture = 'none';
        if (curled >= 3 && extended === 0) gesture = 'fist';
        else if (extended >= 3) gesture = 'open';

        hands.push({ palm: { x: palm.x, y: palm.y }, gesture });
      }

      // Reset smoothing slot for any hand that disappeared
      for (let i = hands.length; i < 2; i++) smoothed.current[i] = null;

      handsDataRef.current = { hands };
    } catch {
      // Occasional boundary failures — ignore
    }
  }, []);

  return {
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
  };
}

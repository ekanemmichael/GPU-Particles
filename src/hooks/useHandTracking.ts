/**
 * Hand Tracking Hook using MediaPipe Hands
 *
 * How hand tracking works:
 * 1. We load the MediaPipe HandLandmarker WASM module from CDN
 * 2. Request webcam access and pipe it to a hidden <video> element
 * 3. Each frame, we call detectForVideo() which returns 21 hand landmarks
 * 4. Landmark #8 is the index finger tip — we map it to simulation coordinates
 * 5. We also detect pinch by measuring distance between thumb tip (#4) and index tip (#8)
 */

import { useCallback, useRef, useState } from 'react';

export interface HandData {
  /** Normalized coordinates (0-1), x is mirrored for selfie view */
  indexTip: { x: number; y: number } | null;
  isPinching: boolean;
}

export function useHandTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const handDataRef = useRef<HandData>({ indexTip: null, isPinching: false });
  const lastVideoTimeRef = useRef(-1);
  // Smoothed position for reducing jitter (exponential moving average)
  const smoothedPos = useRef<{ x: number; y: number } | null>(null);
  const SMOOTHING = 0.15; // 0 = no smoothing, higher = more smooth (0-1 range, applied as lerp toward raw)

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setCameraError(null);

    try {
      // Dynamically import MediaPipe vision tasks
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
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      handLandmarkerRef.current = handLandmarker;

      // Request camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      await video.play();

      videoRef.current = video;
      setIsTracking(true);
      setIsLoading(false);
    } catch (err: any) {
      setIsLoading(false);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow access and try again.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Please connect a webcam.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
    }
    videoRef.current = null;
    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close();
      handLandmarkerRef.current = null;
    }
    handDataRef.current = { indexTip: null, isPinching: false };
    smoothedPos.current = null;
    lastVideoTimeRef.current = -1;
    setIsTracking(false);
  }, []);

  /**
   * Call this each animation frame to run hand detection.
   * We skip detection if the video frame hasn't changed (same currentTime).
   */
  const detect = useCallback(() => {
    const video = videoRef.current;
    const detector = handLandmarkerRef.current;
    if (!video || !detector || video.readyState < 2) return;

    // Skip if same frame
    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;

    try {
      const results = detector.detectForVideo(video, performance.now());

      if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0];
        const indexTip = lm[8]; // Index finger tip
        const thumbTip = lm[4]; // Thumb tip

        // Pinch detection: if thumb and index tips are close together
        const pinchDist = Math.sqrt(
          (thumbTip.x - indexTip.x) ** 2 +
          (thumbTip.y - indexTip.y) ** 2
        );

        // Apply exponential moving average for smooth tracking
        const rawX = 1 - indexTip.x; // Mirror x for selfie view
        const rawY = indexTip.y;

        if (smoothedPos.current) {
          smoothedPos.current.x += (rawX - smoothedPos.current.x) * (1 - SMOOTHING);
          smoothedPos.current.y += (rawY - smoothedPos.current.y) * (1 - SMOOTHING);
        } else {
          smoothedPos.current = { x: rawX, y: rawY };
        }

        handDataRef.current = {
          indexTip: { x: smoothedPos.current.x, y: smoothedPos.current.y },
          isPinching: pinchDist < 0.06,
        };
      } else {
        handDataRef.current = { indexTip: null, isPinching: false };
        smoothedPos.current = null;
      }
    } catch {
      // Detection can occasionally fail on frame boundaries, just skip
    }
  }, []);

  return {
    isTracking,
    isLoading,
    cameraError,
    handDataRef,
    startCamera,
    stopCamera,
    detect,
    setCameraError,
  };
}

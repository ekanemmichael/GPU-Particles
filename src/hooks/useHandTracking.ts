/**
 * Hand Tracking Hook using MediaPipe Hands
 *
 * Detects the following gestures from 21 hand landmarks:
 *  - indexTip (landmark 8) position for pointer control
 *  - pinch: thumb tip (4) close to index tip (8)
 *  - fist: all fingertips curled toward the palm
 *  - openPalm: all fingers extended away from the palm
 */

import { useCallback, useRef, useState } from 'react';

export type HandGesture = 'none' | 'pinch' | 'fist' | 'open';

export interface HandData {
  /** Normalized coordinates (0-1), x is mirrored for selfie view */
  indexTip: { x: number; y: number } | null;
  isPinching: boolean;
  gesture: HandGesture;
}

export function useHandTracking() {
  const [isTracking, setIsTracking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const handDataRef = useRef<HandData>({ indexTip: null, isPinching: false, gesture: 'none' });
  const lastVideoTimeRef = useRef(-1);
  // Smoothed position for reducing jitter (exponential moving average)
  const smoothedPos = useRef<{ x: number; y: number } | null>(null);
  const SMOOTHING = 0.15;

  const [videoReady, setVideoReady] = useState(false);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setCameraError(null);

    try {
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
      setVideoReady(true);
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
    setVideoReady(false);
    if (handLandmarkerRef.current) {
      handLandmarkerRef.current.close();
      handLandmarkerRef.current = null;
    }
    handDataRef.current = { indexTip: null, isPinching: false, gesture: 'none' };
    smoothedPos.current = null;
    lastVideoTimeRef.current = -1;
    setIsTracking(false);
  }, []);

  /**
   * Call this each animation frame to run hand detection.
   */
  const detect = useCallback(() => {
    const video = videoRef.current;
    const detector = handLandmarkerRef.current;
    if (!video || !detector || video.readyState < 2) return;

    if (video.currentTime === lastVideoTimeRef.current) return;
    lastVideoTimeRef.current = video.currentTime;

    try {
      const results = detector.detectForVideo(video, performance.now());

      if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0];
        const indexTip = lm[8];
        const thumbTip = lm[4];
        const wrist = lm[0];

        // Pinch: thumb tip close to index tip
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        const isPinching = pinchDist < 0.06;

        // Fist / open-palm detection using fingertip-to-wrist distances
        // Compare each fingertip distance to the middle-finger MCP (landmark 9) baseline
        const palmSize = Math.hypot(lm[9].x - wrist.x, lm[9].y - wrist.y) || 0.0001;
        const tipIdx = [8, 12, 16, 20]; // index, middle, ring, pinky tips
        const pipIdx = [6, 10, 14, 18]; // corresponding PIP joints (middle knuckles)

        let extendedCount = 0;
        let curledCount = 0;
        for (let i = 0; i < tipIdx.length; i++) {
          const tip = lm[tipIdx[i]];
          const pip = lm[pipIdx[i]];
          const tipToWrist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y) / palmSize;
          const pipToWrist = Math.hypot(pip.x - wrist.x, pip.y - wrist.y) / palmSize;
          // Finger extended if tip is noticeably farther from wrist than its PIP
          if (tipToWrist > pipToWrist + 0.15) extendedCount++;
          // Finger curled if tip is closer to wrist than its PIP
          if (tipToWrist < pipToWrist + 0.02) curledCount++;
        }

        let gesture: HandGesture = 'none';
        if (isPinching) {
          gesture = 'pinch';
        } else if (curledCount >= 3 && extendedCount === 0) {
          gesture = 'fist';
        } else if (extendedCount >= 3) {
          gesture = 'open';
        }

        // Smooth pointer position
        const rawX = 1 - indexTip.x; // mirror for selfie view
        const rawY = indexTip.y;
        if (smoothedPos.current) {
          smoothedPos.current.x += (rawX - smoothedPos.current.x) * (1 - SMOOTHING);
          smoothedPos.current.y += (rawY - smoothedPos.current.y) * (1 - SMOOTHING);
        } else {
          smoothedPos.current = { x: rawX, y: rawY };
        }

        handDataRef.current = {
          indexTip: { x: smoothedPos.current.x, y: smoothedPos.current.y },
          isPinching,
          gesture,
        };
      } else {
        handDataRef.current = { indexTip: null, isPinching: false, gesture: 'none' };
        smoothedPos.current = null;
      }
    } catch {
      // Occasional boundary failures — ignore
    }
  }, []);

  return {
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
  };
}

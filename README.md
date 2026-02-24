# Hand Tracking + GPU Particles (WebGL) — README

A real-time browser demo that uses your webcam to track your hand (MediaPipe) and drive a **GPU-accelerated particle simulation** (Three.js + shaders). Move your index finger to attract/repel **20,000+ particles** smoothly.

---

## Features

- ✅ Webcam hand tracking in the browser (MediaPipe Tasks Vision)
- ✅ Index finger tip controls a force field in the particle sim
- ✅ 20,000+ particles rendered with WebGL (Three.js)
- ✅ GPU-based motion (shader-driven) for performance
- ✅ UI controls: Start/Stop camera, Attract/Repel, Force strength, Radius, FPS
- ✅ Mobile responsive layout

---

## Tech Stack

- **Three.js** — WebGL rendering
- **@mediapipe/tasks-vision** — hand landmarks detection
- **GLSL shaders** — particle motion / effects (GPU)
- **Vite** (recommended) — dev server + build

---

## Project Structure (Example)

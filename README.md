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

.
├─ index.html
├─ package.json
├─ vite.config.js
└─ src/
├─ main.js
├─ handTracker.js
├─ sim/
│ ├─ gpuSim.js
│ ├─ shaders/
│ │ ├─ simVertex.glsl
│ │ ├─ simFragment.glsl
│ │ ├─ renderVertex.glsl
│ │ └─ renderFragment.glsl
├─ ui/
│ ├─ controls.js
│ └─ fps.js
└─ styles.css


> Your actual files may vary depending on how Lovable generated them. The key idea is: **hand tracking feeds a uniform**, and the **GPU updates particle positions**.

---

## Requirements

- Node.js 18+ recommended
- A modern browser (Chrome works best)
- Webcam access (HTTPS required in production)

---

## Getting Started

### 1) Install dependencies

```bash
npm install
2) Run locally
npm run dev

Open the local URL shown in your terminal.

3) Build for production
npm run build
npm run preview
How It Works
1) Hand Tracking Pipeline

The app requests webcam permission and streams the video.

MediaPipe detects hand landmarks each frame.

We extract index finger tip landmark #8.

The finger position is converted to simulation coordinates.

The position is passed into the GPU simulation as a uniform.

Landmark used

Index finger tip: landmarks[0][8]

2) GPU Particle Simulation (High Level)

To keep 20k+ particles smooth, the simulation avoids per-particle CPU updates.

Two common approaches:

Vertex shader motion (simpler, good for many effects)

Ping-pong framebuffer (advanced, best for true GPU “physics”)

This project uses a GPU approach so particles update on the graphics card.

Core idea

Every frame we update particle positions using shader logic

The hand position is used as a force field:

Attract: particles accelerate toward finger

Repel: particles accelerate away from finger

Damping reduces velocity over time so motion looks natural

Controls

Start Camera: begins webcam stream + hand tracking

Stop Camera: stops tracking and releases camera

Attract / Repel: switches the force direction

Force Strength: how strong the pull/push is

Influence Radius: how close particles need to be affected

Reset: re-seeds particles

Performance Notes

20,000 particles should run smoothly on most laptops.

If it’s laggy:

reduce particle count (e.g. 10k)

increase update interval (e.g. detect hand every 2 frames)

disable trails/post-processing if enabled

Mobile performance depends on device GPU.

Common Issues & Fixes
Webcam permission denied

Make sure you allow camera access in the browser.

If deployed, the site must be HTTPS (camera often blocked on HTTP).

Hand tracking not detecting

Improve lighting

Keep hand fully in frame

Ensure only 1–2 hands visible

Confirm @mediapipe/tasks-vision is installed correctly

Black screen / WebGL error

Update browser

Check that WebGL is enabled

Try Chrome

Security & Privacy

Webcam video is processed locally in the browser.

No video is uploaded by default.

If you add analytics or remote logging, disclose it clearly.

Where to Customize

Particle count: particleCount

Hand landmark index: 8 (index fingertip)

Force math: in GPU shader or simulation step

Visual style: point size, glow, background, trails

Roadmap Ideas

Pinch gesture to “grab” particles (thumb tip #4 near index tip #8)

Two-hand interactions (vortex / split forces)

Fluid-like advection for a more “smoke” feel

Audio-reactive particles

Export video / record sessions

Credits

MediaPipe Hands / Tasks Vision for hand landmark detection

Three.js for WebGL rendering

License

Choose one:

MIT (recommended for open demos)

Proprietary (if you want to keep it private)


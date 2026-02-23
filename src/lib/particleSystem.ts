/**
 * GPU Particle System using Three.js and GPUComputationRenderer
 *
 * Architecture:
 * - Particle positions and velocities are stored in floating-point textures (FBOs)
 * - A "ping-pong" technique alternates between two render targets each frame
 * - Fragment shaders update positions/velocities entirely on the GPU
 * - The hand position is passed as a uniform to the velocity shader each frame
 * - A separate Points mesh reads from the position texture to render particles
 *
 * This keeps all 20k+ particle physics on the GPU for smooth 60fps performance.
 */

import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import type { GPUComputeVariable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

// 144 * 144 = 20,736 particles
const WIDTH = 144;
const PARTICLE_COUNT = WIDTH * WIDTH;

// ─── Simplex noise + curl noise for organic motion ───
const NOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Curl noise creates divergence-free flow for beautiful swirling motion
vec3 curlNoise(vec3 p){
  float e = 0.1;
  float n1, n2;
  vec3 curl;
  n1 = snoise(p + vec3(0.0, e, 0.0));
  n2 = snoise(p - vec3(0.0, e, 0.0));
  curl.x = (n1 - n2) / (2.0 * e);
  n1 = snoise(p + vec3(0.0, 0.0, e));
  n2 = snoise(p - vec3(0.0, 0.0, e));
  curl.x -= (n1 - n2) / (2.0 * e);
  n1 = snoise(p + vec3(0.0, 0.0, e));
  n2 = snoise(p - vec3(0.0, 0.0, e));
  curl.y = (n1 - n2) / (2.0 * e);
  n1 = snoise(p + vec3(e, 0.0, 0.0));
  n2 = snoise(p - vec3(e, 0.0, 0.0));
  curl.y -= (n1 - n2) / (2.0 * e);
  n1 = snoise(p + vec3(e, 0.0, 0.0));
  n2 = snoise(p - vec3(e, 0.0, 0.0));
  curl.z = (n1 - n2) / (2.0 * e);
  n1 = snoise(p + vec3(0.0, e, 0.0));
  n2 = snoise(p - vec3(0.0, e, 0.0));
  curl.z -= (n1 - n2) / (2.0 * e);
  return curl;
}
`;

// ─── Position update shader (runs per-particle as a fragment shader on FBO) ───
// Reads current position + velocity, integrates position forward
const POSITION_SHADER = /* glsl */ `
uniform float uDelta;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec4 vel = texture2D(textureVelocity, uv);

  // Euler integration: position += velocity * dt
  pos.xyz += vel.xyz * uDelta;

  // Soft boundary: gently push particles back toward center if they drift too far
  float bound = 7.0;
  vec3 boundForce = -pos.xyz * smoothstep(bound * 0.7, bound, abs(pos.xyz)) * 0.3;
  pos.xyz += boundForce * uDelta;

  gl_FragColor = pos;
}
`;

// ─── Velocity update shader ───
// Applies: hand force, curl noise field, centering force, damping
const VELOCITY_SHADER = /* glsl */ `
uniform float uDelta;
uniform vec3 uHandPosition;    // Hand position in world space (x, y, 0)
uniform float uHandActive;     // 1.0 when hand is detected, 0.0 otherwise
uniform float uForceStrength;  // Adjustable force magnitude
uniform float uInfluenceRadius;// Adjustable influence radius
uniform float uAttractMode;    // 1.0 = attract, -1.0 = repel
uniform float uTime;

${NOISE_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);
  vec4 vel = texture2D(textureVelocity, uv);

  vec3 acc = vec3(0.0);

  // ── Hand interaction force ──
  // When a hand is detected, compute attraction/repulsion based on distance
  if (uHandActive > 0.5) {
    vec3 diff = uHandPosition - pos.xyz;
    float dist = length(diff);
    if (dist < uInfluenceRadius && dist > 0.01) {
      // Force falls off linearly with distance, direction from particle to hand
      float strength = uForceStrength * (1.0 - dist / uInfluenceRadius);
      // Squared falloff for more natural feel near the hand
      strength *= (1.0 - dist / uInfluenceRadius);
      acc += normalize(diff) * strength * uAttractMode;
    }
  }

  // ── Curl noise field ──
  // Creates organic swirling motion even without hand input
  vec3 noisePos = pos.xyz * 0.25 + vec3(0.0, 0.0, uTime * 0.08);
  vec3 curl = curlNoise(noisePos);
  acc += curl * 0.6;

  // ── Gentle centering force ──
  // Prevents particles from drifting away forever
  acc -= pos.xyz * 0.03;

  // Apply acceleration
  vel.xyz += acc * uDelta;

  // Damping for stable simulation
  vel.xyz *= 0.975;

  // Clamp max speed
  float speed = length(vel.xyz);
  if (speed > 8.0) {
    vel.xyz = vel.xyz / speed * 8.0;
  }

  gl_FragColor = vel;
}
`;

// ─── Render vertex shader ───
// Reads particle position from the GPU texture and positions the point
const RENDER_VERTEX = /* glsl */ `
uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform float uPixelRatio;
attribute vec2 reference; // UV coordinate into the position texture

varying float vSpeed;
varying float vDist;

void main() {
  // Read this particle's position from the GPU compute texture
  vec4 pos = texture2D(uPositionTexture, reference);
  vec4 vel = texture2D(uVelocityTexture, reference);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos.xyz, 1.0);

  // Pass speed to fragment for brightness variation
  vSpeed = length(vel.xyz);
  vDist = length(pos.xy) / 6.0;

  // Faster particles appear larger
  gl_PointSize = mix(1.5, 4.0, min(vSpeed / 5.0, 1.0)) * uPixelRatio;
}
`;

// ─── Render fragment shader ───
// Creates soft glowing point sprites with color based on speed
const RENDER_FRAGMENT = /* glsl */ `
uniform vec3 uColor1;
uniform vec3 uColor2;

varying float vSpeed;
varying float vDist;

void main() {
  // Soft radial falloff for glow effect
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;

  float alpha = 1.0 - d * d;
  alpha *= alpha; // Extra soft falloff

  // Mix between two colors based on distance from center
  vec3 color = mix(uColor1, uColor2, clamp(vDist, 0.0, 1.0));

  // Boost brightness with speed
  float brightness = 0.6 + 0.4 * min(vSpeed / 4.0, 1.0);
  color *= brightness;

  gl_FragColor = vec4(color * alpha, alpha * 0.65);
}
`;

export class ParticleSystem {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private gpuCompute!: GPUComputationRenderer;
  private positionVariable!: GPUComputeVariable;
  private velocityVariable!: GPUComputeVariable;
  private particleMesh!: THREE.Points;
  private clock: THREE.Clock;
  private frustumSize = 6;

  public readonly particleCount = PARTICLE_COUNT;

  constructor(canvas: HTMLCanvasElement) {
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    // Dark background matching design system --background: 228 35% 5%
    this.renderer.setClearColor(new THREE.Color('hsl(228, 35%, 5%)'), 1);

    this.scene = new THREE.Scene();

    const aspect = canvas.clientWidth / canvas.clientHeight;
    const s = this.frustumSize;
    this.camera = new THREE.OrthographicCamera(
      -s * aspect, s * aspect, s, -s, 0.1, 100
    );
    this.camera.position.z = 10;

    this.initGPUCompute();
    this.initParticles();
  }

  private initGPUCompute() {
    this.gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, this.renderer);

    // Create initial data textures
    const dtPosition = this.gpuCompute.createTexture();
    const dtVelocity = this.gpuCompute.createTexture();

    // Scatter particles randomly across the visible area
    const posData = dtPosition.image.data as Float32Array;
    for (let i = 0; i < posData.length; i += 4) {
      posData[i]     = (Math.random() - 0.5) * 10; // x
      posData[i + 1] = (Math.random() - 0.5) * 10; // y
      posData[i + 2] = (Math.random() - 0.5) * 0.5; // z (near zero for 2D look)
      posData[i + 3] = 1;
    }

    // Zero initial velocities
    const velData = dtVelocity.image.data as Float32Array;
    for (let i = 0; i < velData.length; i += 4) {
      velData[i] = 0;
      velData[i + 1] = 0;
      velData[i + 2] = 0;
      velData[i + 3] = 1;
    }

    // Register compute variables — each gets its own fragment shader
    this.positionVariable = this.gpuCompute.addVariable(
      'texturePosition', POSITION_SHADER, dtPosition
    );
    this.velocityVariable = this.gpuCompute.addVariable(
      'textureVelocity', VELOCITY_SHADER, dtVelocity
    );

    // Each variable depends on both (position needs velocity, velocity needs position)
    this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);
    this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);

    // Position shader uniforms
    this.positionVariable.material.uniforms['uDelta'] = { value: 0.0 };

    // Velocity shader uniforms — these are updated each frame from JS
    const vu = this.velocityVariable.material.uniforms;
    vu['uDelta'] = { value: 0.0 };
    vu['uHandPosition'] = { value: new THREE.Vector3(999, 999, 0) };
    vu['uHandActive'] = { value: 0.0 };
    vu['uForceStrength'] = { value: 5.0 };
    vu['uInfluenceRadius'] = { value: 2.5 };
    vu['uAttractMode'] = { value: 1.0 };
    vu['uTime'] = { value: 0.0 };

    const error = this.gpuCompute.init();
    if (error !== null) {
      console.error('GPUComputationRenderer init error:', error);
    }
  }

  private initParticles() {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const references = new Float32Array(PARTICLE_COUNT * 2);

    // Each particle gets a UV reference into the position texture
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      references[i * 2] = (i % WIDTH) / WIDTH;
      references[i * 2 + 1] = Math.floor(i / WIDTH) / WIDTH;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPositionTexture: { value: null },
        uVelocityTexture: { value: null },
        // Cyan to blue gradient
        uColor1: { value: new THREE.Color(0.0, 0.9, 1.0) },
        uColor2: { value: new THREE.Color(0.35, 0.5, 1.0) },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: RENDER_VERTEX,
      fragmentShader: RENDER_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particleMesh = new THREE.Points(geometry, material);
    this.scene.add(this.particleMesh);
  }

  /** Call once per frame to advance the simulation and render */
  update() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.getElapsedTime();

    // Update compute shader uniforms
    this.positionVariable.material.uniforms['uDelta'].value = delta;
    this.velocityVariable.material.uniforms['uDelta'].value = delta;
    this.velocityVariable.material.uniforms['uTime'].value = time;

    // Run GPU compute step (updates position + velocity textures)
    this.gpuCompute.compute();

    // Feed the computed textures to the render shader
    const mat = this.particleMesh.material as THREE.ShaderMaterial;
    mat.uniforms.uPositionTexture.value =
      this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
    mat.uniforms.uVelocityTexture.value =
      this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;

    this.renderer.render(this.scene, this.camera);
  }

  /** Pass the detected hand position in world coordinates */
  setHandPosition(x: number, y: number, active: boolean) {
    const u = this.velocityVariable.material.uniforms;
    (u['uHandPosition'].value as THREE.Vector3).set(x, y, 0);
    u['uHandActive'].value = active ? 1.0 : 0.0;
  }

  setForceStrength(v: number) {
    this.velocityVariable.material.uniforms['uForceStrength'].value = v;
  }

  setInfluenceRadius(v: number) {
    this.velocityVariable.material.uniforms['uInfluenceRadius'].value = v;
  }

  setAttractMode(attract: boolean) {
    this.velocityVariable.material.uniforms['uAttractMode'].value = attract ? 1.0 : -1.0;
  }

  /** Reset all particles to random positions with zero velocity */
  resetParticles() {
    const dtPos = this.gpuCompute.createTexture();
    const pd = dtPos.image.data as Float32Array;
    for (let i = 0; i < pd.length; i += 4) {
      pd[i]     = (Math.random() - 0.5) * 10;
      pd[i + 1] = (Math.random() - 0.5) * 10;
      pd[i + 2] = (Math.random() - 0.5) * 0.5;
      pd[i + 3] = 1;
    }
    // Write to both ping-pong targets for clean reset
    this.gpuCompute.renderTexture(dtPos, this.positionVariable.renderTargets[0]);
    this.gpuCompute.renderTexture(dtPos, this.positionVariable.renderTargets[1]);

    const dtVel = this.gpuCompute.createTexture();
    this.gpuCompute.renderTexture(dtVel, this.velocityVariable.renderTargets[0]);
    this.gpuCompute.renderTexture(dtVel, this.velocityVariable.renderTargets[1]);
  }

  /** Returns world-space bounds for mapping hand coordinates */
  getWorldBounds() {
    return {
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom,
    };
  }

  resize(width: number, height: number) {
    const aspect = width / height;
    const s = this.frustumSize;
    this.camera.left = -s * aspect;
    this.camera.right = s * aspect;
    this.camera.top = s;
    this.camera.bottom = -s;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    (this.particleMesh.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value =
      this.renderer.getPixelRatio();
  }

  dispose() {
    this.renderer.dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.ShaderMaterial).dispose();
  }
}

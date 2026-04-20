/**
 * Neural Network Visualization
 *
 * A graph of nodes arranged in layers, connected by edges. Nodes have a "rest"
 * position and a current position; both palms act as soft attractors that pull
 * nearby nodes toward them, while a spring force always pulls each node back to
 * its rest position. Signal pulses travel along the edges to give a sense of
 * activity.
 *
 * Rendered with Canvas 2D — no GPU/shader complexity, full transparency, and
 * crisp lines on top of the webcam.
 */

export interface Hand2D {
  x: number;     // world space
  y: number;
  active: boolean;
  strength: number; // pull strength multiplier (e.g. fist > open > none)
  radius: number;   // influence radius
  attract: boolean; // false = repel
}

interface Node {
  rx: number; ry: number; // rest position
  x: number;  y: number;  // current
  vx: number; vy: number; // velocity
  layer: number;
  activation: number;     // 0..1, used for glow
}

interface Edge {
  a: number;
  b: number;
  pulse: number;          // 0..1 progress of signal
  pulseSpeed: number;
  active: boolean;
}

export class NeuralNetwork {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Tunables
  public springStiffness = 6.0;
  public damping = 0.85;
  public forceStrength = 8.0;
  public influenceRadius = 4.0;

  // World coords map: x in [-aspect*S, +aspect*S], y in [-S, +S]
  private S = 4.5;
  private width = 0;
  private height = 0;

  public readonly nodeCount: number;
  public readonly edgeCount: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;

    this.buildNetwork();
    this.nodeCount = this.nodes.length;
    this.edgeCount = this.edges.length;
  }

  /** 6 layers, varying widths -> ~110 nodes, ~700 edges */
  private buildNetwork() {
    const layers = [8, 14, 18, 18, 14, 8];
    const layerCount = layers.length;
    const xSpread = 5.5;          // total horizontal extent
    const ySpread = 6.0;          // total vertical extent

    const layerStart: number[] = [];
    for (let l = 0; l < layerCount; l++) {
      layerStart[l] = this.nodes.length;
      const count = layers[l];
      const lx = -xSpread / 2 + (l / (layerCount - 1)) * xSpread;
      for (let i = 0; i < count; i++) {
        const ly = -ySpread / 2 + ((i + 0.5) / count) * ySpread
                   + (Math.random() - 0.5) * 0.15;
        this.nodes.push({
          rx: lx, ry: ly,
          x: lx,  y: ly,
          vx: 0,  vy: 0,
          layer: l,
          activation: Math.random() * 0.3,
        });
      }
    }

    // Connect every node in layer L to every node in layer L+1, plus a few skip
    // connections for visual richness.
    for (let l = 0; l < layerCount - 1; l++) {
      const aStart = layerStart[l];
      const aEnd = aStart + layers[l];
      const bStart = layerStart[l + 1];
      const bEnd = bStart + layers[l + 1];
      for (let a = aStart; a < aEnd; a++) {
        for (let b = bStart; b < bEnd; b++) {
          // Sparser long-range connections so the visual doesn't get muddy
          if (Math.random() > 0.55) continue;
          this.edges.push({
            a, b,
            pulse: Math.random(),
            pulseSpeed: 0.4 + Math.random() * 1.2,
            active: Math.random() > 0.4,
          });
        }
      }
    }
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** World-space bounds for hand mapping */
  getWorldBounds() {
    const aspect = this.width / Math.max(1, this.height);
    return {
      left: -this.S * aspect,
      right: this.S * aspect,
      top: this.S,
      bottom: -this.S,
    };
  }

  private worldToScreen(x: number, y: number): [number, number] {
    const aspect = this.width / Math.max(1, this.height);
    const sx = ((x + this.S * aspect) / (2 * this.S * aspect)) * this.width;
    const sy = ((this.S - y) / (2 * this.S)) * this.height;
    return [sx, sy];
  }

  /** Advance physics + render one frame */
  update(dt: number, hands: Hand2D[], time: number) {
    const clampedDt = Math.min(dt, 0.05);

    // ── Physics ──
    for (const n of this.nodes) {
      // Spring back to rest
      let ax = (n.rx - n.x) * this.springStiffness;
      let ay = (n.ry - n.y) * this.springStiffness;

      // Hand forces
      for (const h of hands) {
        if (!h.active) continue;
        const dx = h.x - n.x;
        const dy = h.y - n.y;
        const d = Math.hypot(dx, dy);
        const r = h.radius;
        if (d < r && d > 0.001) {
          const falloff = (1 - d / r) * (1 - d / r);
          const sign = h.attract ? 1 : -1;
          const f = h.strength * falloff * sign;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        }
      }

      n.vx = (n.vx + ax * clampedDt) * this.damping;
      n.vy = (n.vy + ay * clampedDt) * this.damping;
      n.x += n.vx * clampedDt;
      n.y += n.vy * clampedDt;

      // Activation pulses with slight noise + boost when displaced
      const disp = Math.hypot(n.x - n.rx, n.y - n.ry);
      const target = Math.min(1, 0.15 + disp * 0.6 + 0.5 + 0.5 * Math.sin(time * 2 + n.rx + n.ry));
      n.activation += (target - n.activation) * 0.08;
    }

    // ── Edge pulses ──
    for (const e of this.edges) {
      e.pulse += e.pulseSpeed * clampedDt;
      if (e.pulse > 1) {
        e.pulse -= 1;
        e.active = Math.random() > 0.25; // randomly toggle activity
      }
    }

    this.render(hands);
  }

  private render(hands: Hand2D[]) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // ── Edges ──
    ctx.lineWidth = 1;
    for (const e of this.edges) {
      const na = this.nodes[e.a];
      const nb = this.nodes[e.b];
      const [ax, ay] = this.worldToScreen(na.x, na.y);
      const [bx, by] = this.worldToScreen(nb.x, nb.y);

      const baseAlpha = e.active ? 0.22 : 0.08;
      const act = (na.activation + nb.activation) * 0.5;
      ctx.strokeStyle = `hsla(190, 95%, 60%, ${baseAlpha + act * 0.25})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      // Signal pulse — a bright dot traveling along the edge
      if (e.active) {
        const t = e.pulse;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, 8);
        grad.addColorStop(0, 'hsla(180, 100%, 80%, 0.95)');
        grad.addColorStop(1, 'hsla(180, 100%, 80%, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Nodes ──
    for (const n of this.nodes) {
      const [sx, sy] = this.worldToScreen(n.x, n.y);
      const r = 3 + n.activation * 3;

      // Outer glow
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
      glow.addColorStop(0, `hsla(190, 100%, 70%, ${0.55 * n.activation + 0.2})`);
      glow.addColorStop(1, 'hsla(190, 100%, 70%, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, r * 4, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `hsl(190, 100%, ${60 + n.activation * 30}%)`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Hand attractor rings ──
    for (const h of hands) {
      if (!h.active) continue;
      const [hx, hy] = this.worldToScreen(h.x, h.y);
      // Convert world radius to px
      const aspect = this.width / Math.max(1, this.height);
      const rPx = (h.radius / (2 * this.S * aspect)) * this.width;

      const color = h.attract ? '180, 100%, 70%' : '320, 100%, 70%';
      ctx.strokeStyle = `hsla(${color}, 0.55)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, rPx, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `hsla(${color}, 0.3)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, rPx * 0.55, 0, Math.PI * 2);
      ctx.stroke();

      // Center dot
      ctx.fillStyle = `hsla(${color}, 0.95)`;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Snap all nodes back to rest with zero velocity */
  reset() {
    for (const n of this.nodes) {
      n.x = n.rx;
      n.y = n.ry;
      n.vx = 0;
      n.vy = 0;
    }
  }

  dispose() {
    this.nodes = [];
    this.edges = [];
  }
}

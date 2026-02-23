declare module 'three/examples/jsm/misc/GPUComputationRenderer.js' {
  import { WebGLRenderer, DataTexture, WebGLRenderTarget } from 'three';

  export class GPUComputationRenderer {
    constructor(sizeX: number, sizeY: number, renderer: WebGLRenderer);
    createTexture(): DataTexture;
    addVariable(name: string, shader: string, texture: DataTexture): GPUComputeVariable;
    setVariableDependencies(variable: GPUComputeVariable, dependencies: GPUComputeVariable[]): void;
    init(): string | null;
    compute(): void;
    getCurrentRenderTarget(variable: GPUComputeVariable): WebGLRenderTarget;
    getAlternateRenderTarget(variable: GPUComputeVariable): WebGLRenderTarget;
    renderTexture(input: DataTexture, output: WebGLRenderTarget): void;
  }

  export interface GPUComputeVariable {
    name: string;
    material: {
      uniforms: Record<string, { value: unknown }>;
    };
    renderTargets: WebGLRenderTarget[];
  }
}

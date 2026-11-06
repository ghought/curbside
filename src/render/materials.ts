// World-space procedural surface detail, injected into the stock PBR shaders.
// Brick, siding and shingles cost a few ALU ops and zero bytes of texture.

import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';

export const shared = {
  uTime: { value: 0 },
  uGlow: { value: 0 },
};

const NOISE = /* glsl */ `
float cbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cbNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cbHash(i), cbHash(i + vec2(1, 0)), f.x), mix(cbHash(i + vec2(0, 1)), cbHash(i + vec2(1, 1)), f.x), f.y);
}
`;

const PATTERNS = /* glsl */ `
${NOISE}
vec3 cbPattern(float pat, vec3 p, vec3 n, vec3 col) {
  float h = abs(n.x) > abs(n.z) ? p.z : p.x;
  int id = int(pat + 0.5);
  if (id == 1) { // siding
    float r = fract(p.y / 0.27);
    float line = smoothstep(0.0, 0.14, r);
    return col * (0.76 + 0.24 * line) * (0.97 + 0.06 * r);
  }
  if (id == 2) { // brick
    float row = floor(p.y / 0.19);
    float x = h / 0.44 + mod(row, 2.0) * 0.5;
    float brick = floor(x);
    vec2 f = vec2(fract(x), fract(p.y / 0.19));
    float tint = cbHash(vec2(brick, row));
    float mortar = smoothstep(0.0, 0.05, f.x) * smoothstep(1.0, 0.95, f.x) * smoothstep(0.0, 0.1, f.y) * smoothstep(1.0, 0.9, f.y);
    vec3 b = col * (0.78 + 0.42 * tint);
    return mix(vec3(0.62, 0.56, 0.5) * 0.8, b, mortar);
  }
  if (id == 3) { // shingle
    float s = p.y / 0.3;
    float row = floor(s);
    float x = h / 0.5 + mod(row, 2.0) * 0.5;
    float tint = cbHash(vec2(floor(x), row));
    float line = smoothstep(0.0, 0.18, fract(s));
    float gap = smoothstep(0.0, 0.05, fract(x)) ;
    return col * (0.74 + 0.34 * tint) * (0.62 + 0.38 * line) * (0.82 + 0.18 * gap);
  }
  if (id == 4) { // stucco
    return col * (0.93 + 0.1 * cbNoise(vec2(h, p.y) * 9.0) + 0.05 * cbNoise(vec2(h, p.y) * 37.0));
  }
  if (id == 5) { // planks
    float x = h / 0.32;
    return col * (0.8 + 0.3 * cbHash(vec2(floor(x), 3.0))) * (0.82 + 0.18 * smoothstep(0.0, 0.07, fract(x)));
  }
  if (id == 6) { // leaves
    float a = cbNoise(vec2(h, p.y) * 5.0 + p.zx * 2.0);
    float b = cbNoise(vec2(h, p.y) * 15.0);
    return col * (0.66 + 0.52 * a * 0.7 + 0.42 * b * 0.6);
  }
  if (id == 7) { // pavers
    vec2 g = vec2(h, abs(n.y) > 0.5 ? p.z : p.y) / 0.62;
    float t = cbHash(floor(g));
    float e = smoothstep(0.0, 0.05, fract(g.x)) * smoothstep(0.0, 0.05, fract(g.y));
    return col * (0.9 + 0.16 * t) * (0.76 + 0.24 * e);
  }
  if (id == 9) { // awning stripes
    float s = step(0.5, fract(h / 0.9));
    return mix(col, vec3(0.95, 0.92, 0.85), s);
  }
  if (id == 10) { // shutter slats
    return col * (0.74 + 0.26 * smoothstep(0.0, 0.35, fract(p.y / 0.09)));
  }
  if (id == 11) { // rough stone and bark
    return col * (0.76 + 0.34 * cbNoise(vec2(h, p.y) * vec2(9.0, 3.0)));
  }
  return col;
}
`;

function inject(shader: WebGLProgramParametersWithUniforms, swayAmount: number) {
  shader.uniforms.uTime = shared.uTime;
  shader.uniforms.uGlow = shared.uGlow;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', /* glsl */ `#include <common>
      attribute vec2 aInfo;
      varying float vPat;
      varying vec3 vWPos;
      varying vec3 vWNor;
      uniform float uTime;`)
    .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
      vPat = aInfo.x;
      vec4 cbW = modelMatrix * vec4(position, 1.0);
      ${swayAmount > 0 ? /* glsl */ `
      float cbPhase = cbW.x * 0.55 + cbW.z * 0.4;
      float cbS = aInfo.y * ${swayAmount.toFixed(3)};
      transformed.x += sin(uTime * 1.7 + cbPhase) * cbS;
      transformed.z += cos(uTime * 1.3 + cbPhase * 1.3) * cbS * 0.7;
      transformed.y += sin(uTime * 2.1 + cbPhase) * cbS * 0.3;` : ''}
      vWPos = cbW.xyz;
      vWNor = normalize(mat3(modelMatrix) * normal);`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', /* glsl */ `#include <common>
      varying float vPat;
      varying vec3 vWPos;
      varying vec3 vWNor;
      uniform float uGlow;
      ${PATTERNS}`)
    .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
      diffuseColor.rgb = cbPattern(vPat, vWPos, vWNor, diffuseColor.rgb);
      // Cheap contact shading: everything darkens toward the ground.
      diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 1.1, vWPos.y));`)
    .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
      if (vPat > 7.5 && vPat < 8.5) {
        // Some rooms are lit, some aren't, and the windows stay that way all evening.
        float lit = step(0.42, cbHash(floor(vec2(vWPos.x + vWPos.z, vWPos.y) * vec2(0.62, 0.34))));
        totalEmissiveRadiance += vec3(1.0, 0.56, 0.2) * uGlow * lit * 0.85;
      }`);
}

function patterned(params: ConstructorParameters<typeof MeshStandardMaterial>[0], sway: number, key: string) {
  const m = new MeshStandardMaterial({ vertexColors: true, ...params });
  m.onBeforeCompile = (s) => inject(s, sway);
  m.customProgramCacheKey = () => key;
  return m;
}

export const matte = patterned({ roughness: 0.84, metalness: 0 }, 0, 'cb-matte');
export const gloss = patterned({ roughness: 0.2, metalness: 0.45 }, 0, 'cb-gloss');
export const leaf = patterned({ roughness: 0.78, metalness: 0 }, 0.09, 'cb-leaf');

/** The ground: a painted canvas plus world-space grain, so it stays crisp up close. */
export function groundMaterial() {
  const m = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE}`)
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
        float cbG = cbNoise(vWPos.xz * 3.3) * 0.5 + cbNoise(vWPos.xz * 11.0) * 0.32 + cbNoise(vWPos.xz * 31.0) * 0.3;
        diffuseColor.rgb *= 0.8 + 0.34 * cbG;`);
  };
  m.customProgramCacheKey = () => 'cb-ground';
  return m;
}

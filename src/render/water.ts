import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';

/** A pool surface: depth gradient plus animated caustics, all in one small shader. */
export function makeWater(w: number, d: number) {
  const mat = new ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: [w, d] } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uT;
      uniform vec2 uSize;
      float cell(vec2 p, float t) {
        vec2 i = floor(p), f = fract(p);
        float best = 1.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y));
          vec2 h = fract(sin(vec2(dot(i + g, vec2(127.1, 311.7)), dot(i + g, vec2(269.5, 183.3)))) * 43758.5453);
          h = 0.5 + 0.5 * sin(t + 6.2831 * h);
          best = min(best, length(g + h - f));
        }
        return best;
      }
      void main() {
        vec2 p = vUv * uSize;
        float edge = min(min(vUv.x, 1.0 - vUv.x) * uSize.x, min(vUv.y, 1.0 - vUv.y) * uSize.y);
        float deep = smoothstep(0.0, 1.8, edge);
        vec3 col = mix(vec3(0.2, 0.62, 0.68), vec3(0.015, 0.26, 0.42), deep);
        // Thin bright web: distance to the nearest cell wall, not the cell itself.
        float a = cell(p * 0.85, uT * 0.8);
        float b = cell(p * 1.5 + 3.0, uT * 1.1);
        float web = smoothstep(0.62, 0.86, a) * 0.9 + smoothstep(0.62, 0.88, b) * 0.55;
        col += vec3(0.42, 0.72, 0.76) * web * 0.42;
        col = mix(col, vec3(0.05, 0.2, 0.26), (1.0 - smoothstep(0.0, 0.14, edge)) * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = false;
  return {
    mesh,
    update(t: number) {
      mat.uniforms.uT.value = t;
    },
  };
}

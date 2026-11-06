import * as THREE from 'three';

// Cartoon (toon) uslubi uchun 3 pog'onali yorug'lik
const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

export function toon(color, extra = {}) {
  const { roughness, metalness, clearcoat, clearcoatRoughness, ...rest } = extra;
  return new THREE.MeshToonMaterial({ color, gradientMap, ...rest });
}

export const woodMat = (color = '#a86b45') => toon(color);
export const carPaintMat = (color = '#f8f9fa') => toon(color);
export const glassMat = (color = '#72efdd') => toon(color);
export const chromeMat = (color = '#dee2e6') => toon(color);

export function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}

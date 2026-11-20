// Tiny geometry merge helper for Solstice City v4. Static scenery is merged
// into a handful of meshes so the software renderer stays fast: one mesh per
// material instead of one per building, tree or lamp. Only indexed
// BufferGeometry with position/normal/uv is supported (Box, Cylinder, Plane,
// Sphere, Cone — everything this game uses).

import * as THREE from '../vendor/three.module.min.js';

// Concatenate geometries. Each entry: { geo, matrix, color } where matrix
// places the piece in world space and color (THREE.Color or hex) fills the
// vertex-color attribute for the whole piece.
export function mergePieces(pieces) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let base = 0;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const piece of pieces) {
    const geo = piece.geo;
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const col = new THREE.Color(piece.color ?? 0xffffff);
    const mat = piece.matrix ?? new THREE.Matrix4();
    const nm = new THREE.Matrix3().getNormalMatrix(mat);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mat);
      positions.push(v.x, v.y, v.z);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      normals.push(n.x, n.y, n.z);
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
      else uvs.push(0, 0);
      colors.push(col.r, col.g, col.b);
    }
    const idx = geo.index;
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + base);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + base);
    }
    base += pos.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  out.setIndex(indices);
  return out;
}

// A matrix that places a box of the given size at a world position.
export function boxMatrix(x, y, z, w, h, d, ry = 0) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d));
  return m;
}

// Reusable unit geometries so callers never allocate per piece.
export const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  plane: new THREE.PlaneGeometry(1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
};

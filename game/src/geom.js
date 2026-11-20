// Solstice City v3 — geometry helpers. The static world is built by merging
// boxes and quads into a handful of big BufferGeometries (one draw call each)
// instead of hundreds of little meshes: that is what keeps the frame rate
// alive under software rendering. Vertex colors tint each piece; UVs tile a
// shared window texture across facades.

import * as THREE from 'three';

export function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

export function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Accumulates triangles into one geometry. Boxes get per-face UVs so a
// window texture tiles across a facade by world size; flat quads get a
// single UV (they are tinted by vertex color alone).
export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
    this.groups = [];
  }

  _vert(x, y, z, nx, ny, nz, r, g, b, u, v) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(r, g, b);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  _quad(a, b, c, d) {
    const base = this.pos.length / 3;
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return [a, b, c, d];
  }

  // Axis-aligned box centred at (cx, cy, cz). uvCell: world units per tile
  // of the facade texture. The roof gets a flat dark UV instead of windows.
  pushBox(cx, cy, cz, w, h, d, color, uvCell = 28) {
    const [r, g, b] = hexRgb(color);
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const faces = [
      // +x, -x, +y (roof), -y (floor), +z, -z — each listed counter-clockwise
      // as seen from outside, so the front face is the outside one.
      { n: [1, 0, 0], u: d / uvCell, v: h / uvCell, pts: [[hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd], [hw, hh, hd]] },
      { n: [-1, 0, 0], u: d / uvCell, v: h / uvCell, pts: [[-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd], [-hw, hh, -hd]] },
      { n: [0, 1, 0], u: 0.05, v: 0.05, pts: [[hw, hh, -hd], [-hw, hh, -hd], [-hw, hh, hd], [hw, hh, hd]] },
      { n: [0, -1, 0], u: 0.05, v: 0.05, pts: [[hw, -hh, hd], [-hw, -hh, hd], [-hw, -hh, -hd], [hw, -hh, -hd]] },
      { n: [0, 0, 1], u: w / uvCell, v: h / uvCell, pts: [[-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd]] },
      { n: [0, 0, -1], u: w / uvCell, v: h / uvCell, pts: [[hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd]] },
    ];
    for (const f of faces) {
      const base = this.pos.length / 3;
      const uvCorners = [[0, 0], [f.u, 0], [f.u, f.v], [0, f.v]];
      for (let k = 0; k < 4; k += 1) {
        const p = f.pts[k];
        this._vert(cx + p[0], cy + p[1], cz + p[2], f.n[0], f.n[1], f.n[2], r, g, b, uvCorners[k][0], uvCorners[k][1]);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // Flat horizontal quad at height y, corners in (x, z), one color.
  // Wound counter-clockwise seen from above, so the front face is up.
  pushFlatQuad(x0, z0, x1, z1, y, color) {
    const [r, g, b] = hexRgb(color);
    const base = this.pos.length / 3;
    this._vert(x0, y, z0, 0, 1, 0, r, g, b, 0, 0);
    this._vert(x1, y, z0, 0, 1, 0, r, g, b, 1, 0);
    this._vert(x1, y, z1, 0, 1, 0, r, g, b, 1, 1);
    this._vert(x0, y, z1, 0, 1, 0, r, g, b, 0, 1);
    this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  // A vertical quad (a wall, a sign board, a fence) from two bottom corners.
  pushWall(x0, y0, z0, x1, y1, z1, color) {
    const [r, g, b] = hexRgb(color);
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz) || 1;
    let nx = -dz / len, ny = 0, nz = dx / len;
    if (Math.abs(dy) > 0.01) { nx = 0; ny = 1; nz = 0; }
    const base = this.pos.length / 3;
    this._vert(x0, y0, z0, nx, ny, nz, r, g, b, 0, 0);
    this._vert(x1, y0, z1, nx, ny, nz, r, g, b, 1, 0);
    this._vert(x1, y1, z1, nx, ny, nz, r, g, b, 1, 1);
    this._vert(x0, y1, z0, nx, ny, nz, r, g, b, 0, 1);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setIndex(this.idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

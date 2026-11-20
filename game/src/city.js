// Solstice City v3 — the city itself. The logic layer is a flat 2D plane:
// buildings are axis-aligned rectangles the player and cars collide with,
// roads are the strips between the blocks, and every landmark sits on open
// ground a car can reach. The 3D meshes are built from this same data, so
// what you see is always what you collide with.

import * as THREE from 'three';
import {
  WORLD, HALF, PITCH, ROAD, BLOCK, districtAt, LANDMARKS, SPAWN,
  STASH_SPOTS, STASH_RESPAWN, LIGHT_POINTS, lightIsGreen, NEON_SIGNS, NEON_COLORS,
} from './config.js';
import { RNG } from './random.js';
import { MeshBuilder, makeCanvas, canvasTexture, hexRgb } from './geom.js';

// Logic (x, y) -> three.js (x - HALF, yUp, z = y - HALF).
export function toWorld(x, y, up = 0) {
  return new THREE.Vector3(x - HALF, up, y - HALF);
}
export function toLogic(wx, wz) {
  return { x: wx + HALF, y: wz + HALF };
}

export class City {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(20261121);
    this.buildings = []; // {x, y, w, h, hgt, district, tint}
    this.trees = []; // {x, y, palm, scale}
    this.lamps = []; // {x, y}
    this.signs = []; // {x, y, z, text, color, face}
    this.stashes = STASH_SPOTS.map((s) => ({ x: s.x, y: s.y, taken: false, timer: 0 }));
    this.lights = LIGHT_POINTS.map((p) => ({ x: p.x, y: p.y, meshes: null }));
    this.landmarks = LANDMARKS;
    this.spawn = { ...SPAWN };
    this._layoutBlocks();
    this._placeTreesAndLamps();
    this._placeSigns();
  }

  _layoutBlocks() {
    for (let i = 0; i < 12; i += 1) {
      for (let j = 0; j < 12; j += 1) {
        const d = districtAt(i, j);
        if (d.use === 'runway' || d.use === 'park' || d.use === 'plaza') continue;
        const bx = i * PITCH + ROAD / 2;
        const by = j * PITCH + ROAD / 2;
        // The garage block gets the landmark building itself.
        if (i === 6 && j === 7) {
          this.buildings.push({
            x: LANDMARKS.garage.x, y: LANDMARKS.garage.y,
            w: LANDMARKS.garage.w, h: LANDMARKS.garage.h,
            hgt: 26, district: 'Garage', tint: 0x7a5a3a,
          });
          continue;
        }
        const hgt = Math.round(this.rng.range(d.h[0], d.h[1]));
        if (hgt <= 0) continue;
        // A little inset jitter so the skyline is not a perfect grid.
        const inset = this.rng.range(0, 14);
        this.buildings.push({
          x: bx + inset, y: by + inset,
          w: BLOCK - inset * 2, h: BLOCK - inset * 2,
          hgt, district: d.name, tint: d.tint,
        });
      }
    }
  }

  _placeTreesAndLamps() {
    // Palms line the beachfront and the boardwalk; round trees fill the park.
    for (let k = 0; k < 46; k += 1) {
      const y = 1700 + this.rng.range(0, 640);
      this.trees.push({ x: 2290 + this.rng.range(-14, 14), y, palm: true, scale: this.rng.range(0.9, 1.3) });
    }
    for (let k = 0; k < 34; k += 1) {
      this.trees.push({
        x: 440 + this.rng.range(0, 360), y: 840 + this.rng.range(0, 360),
        palm: this.rng.chance(0.45), scale: this.rng.range(0.8, 1.25),
      });
    }
    for (let k = 0; k < 22; k += 1) {
      const road = this.rng.pick([200, 600, 1000, 1400, 1800, 2200]);
      const along = this.rng.range(120, 2280);
      this.trees.push({
        x: this.rng.chance(0.5) ? road : along,
        y: this.rng.chance(0.5) ? along : road,
        palm: this.rng.chance(0.45), scale: this.rng.range(0.8, 1.2),
      });
    }
    // Street lamps on the main avenues, every other block.
    for (let i = 0; i <= 12; i += 2) {
      for (const j of [2, 6, 10]) {
        this.lamps.push({ x: i * PITCH, y: j * PITCH + 26 });
        this.lamps.push({ x: j * PITCH + 26, y: i * PITCH });
      }
    }
  }

  _placeSigns() {
    // Neon boards mounted just outside a facade, at street level so they
    // sit on the wall of even the lowest villa. Face letters: s/n/e/w.
    const spots = [
      { x: 1500, y: 1181, face: 's' }, { x: 1419, y: 1100, face: 'w' },
      { x: 1100, y: 981, face: 's' }, { x: 1181, y: 900, face: 'e' },
      { x: 1900, y: 1981, face: 's' }, { x: 1981, y: 1900, face: 'e' },
      { x: 2259, y: 1200, face: 'w' }, { x: 2259, y: 1600, face: 'w' },
      { x: 581, y: 1300, face: 'e' }, { x: 1100, y: 581, face: 's' },
      { x: 1900, y: 2181, face: 's' }, { x: 500, y: 2181, face: 's' },
    ];
    spots.forEach((s, k) => {
      this.signs.push({
        x: s.x, y: s.y, z: 10,
        text: NEON_SIGNS[k % NEON_SIGNS.length],
        color: NEON_COLORS[k % NEON_COLORS.length],
        face: s.face,
      });
    });
  }

  pointInBuilding(x, y, pad = 0) {
    for (const b of this.buildings) {
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
    }
    return null;
  }

  // A point on the nearest road centreline (roads run at multiples of 200).
  nearestRoadPoint(x, y) {
    const rx = Math.round(x / PITCH) * PITCH;
    const ry = Math.round(y / PITCH) * PITCH;
    return Math.abs(x - rx) < Math.abs(y - ry) ? { x: rx, y } : { x, y: ry };
  }

  randomRoadPoint(rng) {
    const horizontal = rng.chance(0.5);
    const line = rng.int(0, 12) * PITCH;
    const along = rng.range(60, WORLD - 60);
    return horizontal ? { x: along, y: line } : { x: line, y: along };
  }

  // The traffic light state at time t for an approach axis.
  lightState(t, axis) {
    return lightIsGreen(t, axis) ? 'green' : 'red';
  }

  update(dt, time) {
    for (const s of this.stashes) {
      if (s.taken) {
        s.timer -= dt;
        if (s.timer <= 0) { s.taken = false; s.timer = 0; }
      }
    }
    // Traffic-light meshes glow with the current state.
    for (const l of this.lights) {
      if (!l.meshes) continue;
      const ns = this.lightState(time, 'ns');
      l.meshes.ns.material.color.set(ns === 'green' ? 0x2aff66 : 0xff2a2a);
      l.meshes.ew.material.color.set(ns === 'green' ? 0xff2a2a : 0x2aff66);
    }
  }
}

// ---- Static meshes, built once from the logic data above. ----
// The ground is one merged mesh (vertex colors: roads, dashes, crosswalks,
// sidewalks, park, plaza, runway, sand). Buildings are two merged meshes:
// facades with a shared window texture (about a third of the windows lit)
// and flat dark roofs. Trees, lamps and light pools are InstancedMeshes.
// Neon signs are glowing canvas-textured planes.

function windowTexture(rng) {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = '#23232e';
  ctx.fillRect(0, 0, 256, 256);
  const cell = 32;
  for (let gx = 0; gx < 8; gx += 1) {
    for (let gy = 0; gy < 8; gy += 1) {
      const lit = rng.chance(0.36);
      ctx.fillStyle = lit ? '#ffd27a' : '#161622';
      ctx.fillRect(gx * cell + 6, gy * cell + 6, cell - 12, cell - 12);
      if (lit) {
        ctx.fillStyle = 'rgba(255, 210, 122, 0.25)';
        ctx.fillRect(gx * cell + 2, gy * cell + 2, cell - 4, cell - 4);
      }
    }
  }
  const tex = canvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function signTexture(text, color) {
  const { canvas, ctx } = makeCanvas(256, 96);
  ctx.fillStyle = '#0c0616';
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.font = 'bold 52px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 50);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, 128, 50);
  return canvasTexture(canvas);
}

// A vertical quad with explicit UVs, pushed straight into a MeshBuilder.
function pushTexturedQuad(b, x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, color, uMax, vMax) {
  const [r, g, bl] = hexRgb(color);
  // Normal from the first three corners.
  const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0;
  const vx = x3 - x0, vy = y3 - y0, vz = z3 - z0;
  let nxn = uy * vz - uz * vy, nyn = uz * vx - ux * vz, nzn = ux * vy - uy * vx;
  const len = Math.hypot(nxn, nyn, nzn) || 1;
  nxn /= len; nyn /= len; nzn /= len;
  const base = b.pos.length / 3;
  const pts = [[x0, y0, z0, 0, 0], [x1, y1, z1, uMax, 0], [x2, y2, z2, uMax, vMax], [x3, y3, z3, 0, vMax]];
  for (const p of pts) b._vert(p[0], p[1], p[2], nxn, nyn, nzn, r, g, bl, p[3], p[4]);
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function buildCityMeshes(game) {
  const scene = game.renderer.scene;
  const city = game.city;
  const rng = new RNG(77);

  // ---- Ground: base, roads, dashes, crosswalks, block pads, runway, sand.
  const g = new MeshBuilder();
  const W = (x) => x - HALF; // logic x -> world x
  g.pushFlatQuad(W(0), W(0), W(WORLD), W(WORLD), 0, 0x23232c);
  // Block pads (sidewalk tint by district).
  for (let i = 0; i < 12; i += 1) {
    for (let j = 0; j < 12; j += 1) {
      const d = districtAt(i, j);
      const x0 = i * PITCH + ROAD / 2, y0 = j * PITCH + ROAD / 2;
      let tint = 0x2e2e38;
      if (d.use === 'park') tint = 0x2c5a34;
      if (d.use === 'plaza') tint = 0x8a7452;
      if (d.use === 'runway') tint = 0x1c1c22;
      g.pushFlatQuad(W(x0), W(y0), W(x0 + BLOCK), W(y0 + BLOCK), 0.01, tint);
    }
  }
  // Roads: lighter strips on every grid line.
  for (let k = 0; k <= 12; k += 1) {
    const c = k * PITCH;
    g.pushFlatQuad(W(0), W(c - ROAD / 2), W(WORLD), W(c + ROAD / 2), 0.02, 0x383844);
    g.pushFlatQuad(W(c - ROAD / 2), W(0), W(c + ROAD / 2), W(WORLD), 0.02, 0x383844);
  }
  // Centre dashes, pale yellow, every 60 units.
  for (let k = 0; k <= 12; k += 1) {
    const c = k * PITCH;
    for (let s = 30; s < WORLD; s += 60) {
      g.pushFlatQuad(W(s), W(c - 2), W(s + 24), W(c + 2), 0.04, 0xc8c8a8);
      g.pushFlatQuad(W(c - 2), W(s), W(c + 2), W(s + 24), 0.04, 0xc8c8a8);
    }
  }
  // Crosswalks at the light intersections.
  for (const p of LIGHT_POINTS) {
    for (let s = -18; s <= 18; s += 9) {
      g.pushFlatQuad(W(p.x - 18), W(p.y + s), W(p.x + 18), W(p.y + s + 4), 0.04, 0xd8d8d8);
      g.pushFlatQuad(W(p.x + s), W(p.y - 18), W(p.x + s + 4), W(p.y + 18), 0.04, 0xd8d8d8);
    }
  }
  // Runway centreline.
  for (let s = 100; s < 1100; s += 60) {
    g.pushFlatQuad(W(188), W(s), W(212), W(s + 30), 0.04, 0xe8e8e8);
  }
  // Beach sand along the east edge.
  g.pushFlatQuad(W(2280), W(0), W(WORLD), W(WORLD), 0.02, 0xbfa06e);
  const ground = g.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Buildings: facades with the window texture, flat roofs.
  const winTex = windowTexture(new RNG(5));
  const walls = new MeshBuilder();
  const roofs = new MeshBuilder();
  for (const b of city.buildings) {
    const x0 = W(b.x), x1 = W(b.x + b.w);
    const z0 = W(b.y), z1 = W(b.y + b.h);
    const h = b.hgt;
    const uW = b.w / 28, uD = b.h / 28, vH = h / 28;
    // South face (z1), north face (z0), east (x1), west (x0).
    pushTexturedQuad(walls, x0, 0, z1, x1, 0, z1, x1, h, z1, x0, h, z1, b.tint, uW, vH);
    pushTexturedQuad(walls, x1, 0, z0, x0, 0, z0, x0, h, z0, x1, h, z0, b.tint, uW, vH);
    pushTexturedQuad(walls, x1, 0, z1, x1, 0, z0, x1, h, z0, x1, h, z1, b.tint, uD, vH);
    pushTexturedQuad(walls, x0, 0, z0, x0, 0, z1, x0, h, z1, x0, h, z0, b.tint, uD, vH);
    roofs.pushFlatQuad(x0, z0, x1, z1, h, 0x191920);
    // A rooftop box on the taller towers, for a skyline that is not flat.
    if (h > 90) {
      const rw = Math.min(30, b.w * 0.3);
      roofs.pushBox((x0 + x1) / 2, h + 4, (z0 + z1) / 2, rw, 8, rw, 0x22222c, 28);
    }
  }
  const wallMat = new THREE.MeshLambertMaterial({
    vertexColors: true, map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.55,
  });
  const wallMesh = walls.build(wallMat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  scene.add(wallMesh);
  scene.add(roofs.build(new THREE.MeshLambertMaterial({ vertexColors: true })));

  // ---- Trees: instanced trunks and canopies (palms get cones, others spheres).
  const trunkGeo = new THREE.CylinderGeometry(0.9, 1.5, 11, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4232 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, city.trees.length);
  const palmGeo = new THREE.ConeGeometry(7, 10, 6);
  const palmMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34 });
  const roundGeo = new THREE.SphereGeometry(6.5, 8, 6);
  const roundMat = new THREE.MeshLambertMaterial({ color: 0x3f7a4a });
  const palms = city.trees.filter((t) => t.palm);
  const rounds = city.trees.filter((t) => !t.palm);
  const palmMesh = new THREE.InstancedMesh(palmGeo, palmMat, Math.max(1, palms.length));
  const roundMesh = new THREE.InstancedMesh(roundGeo, roundMat, Math.max(1, rounds.length));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  city.trees.forEach((t, i) => {
    const wx = W(t.x), wz = W(t.y);
    m4.compose(pv.set(wx, 5.5 * t.scale, wz), q.identity(), sv.set(t.scale, t.scale, t.scale));
    trunks.setMatrixAt(i, m4);
  });
  palms.forEach((t, i) => {
    m4.compose(pv.set(W(t.x), 14 * t.scale, W(t.y)), q.identity(), sv.set(t.scale, t.scale, t.scale));
    palmMesh.setMatrixAt(i, m4);
  });
  rounds.forEach((t, i) => {
    m4.compose(pv.set(W(t.x), 14 * t.scale, W(t.y)), q.identity(), sv.set(t.scale, t.scale, t.scale));
    roundMesh.setMatrixAt(i, m4);
  });
  trunks.instanceMatrix.needsUpdate = true;
  palmMesh.instanceMatrix.needsUpdate = true;
  roundMesh.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(palmMesh);
  scene.add(roundMesh);

  // ---- Street lamps: instanced poles, warm bulbs, glow pools on the road.
  const poleGeo = new THREE.CylinderGeometry(0.35, 0.5, 14, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, city.lamps.length);
  const bulbGeo = new THREE.SphereGeometry(1.2, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, city.lamps.length);
  const poolGeo = new THREE.CircleGeometry(10, 16);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xff9a3c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, city.lamps.length);
  const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  city.lamps.forEach((l, i) => {
    const wx = W(l.x), wz = W(l.y);
    m4.compose(pv.set(wx, 7, wz), q.identity(), sv.set(1, 1, 1));
    poles.setMatrixAt(i, m4);
    m4.compose(pv.set(wx, 14, wz), q.identity(), sv.set(1, 1, 1));
    bulbs.setMatrixAt(i, m4);
    m4.compose(pv.set(wx, 0.06, wz), flatQ, sv.set(1, 1, 1));
    pools.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  pools.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(bulbs);
  scene.add(pools);

  // ---- Neon signs on the facades.
  for (const s of city.signs) {
    const tex = signTexture(s.text, s.color);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), mat);
    const wx = W(s.x), wz = W(s.y);
    plane.position.set(wx, s.z, wz);
    if (s.face === 's') plane.rotation.y = 0;
    if (s.face === 'n') plane.rotation.y = Math.PI;
    if (s.face === 'e') plane.rotation.y = Math.PI / 2;
    if (s.face === 'w') plane.rotation.y = -Math.PI / 2;
    scene.add(plane);
  }

  // ---- Props, merged: water tower, skyline silhouettes, the parked plane,
  // the plaza fountain basin, traffic-light poles and housings.
  const props = new MeshBuilder();
  // Water tower at Portside (700, 1900).
  const twx = W(700), twz = W(1900);
  props.pushBox(twx - 8, 9, twz - 8, 3, 18, 3, 0x3a3a44, 28);
  props.pushBox(twx + 8, 9, twz - 8, 3, 18, 3, 0x3a3a44, 28);
  props.pushBox(twx - 8, 9, twz + 8, 3, 18, 3, 0x3a3a44, 28);
  props.pushBox(twx + 8, 9, twz + 8, 3, 18, 3, 0x3a3a44, 28);
  props.pushBox(twx, 24, twz, 26, 12, 26, 0x8a4a3a, 28);
  props.pushBox(twx, 32, twz, 28, 3, 28, 0x5a2a22, 28);
  // Distant skyline silhouettes beyond the west and east edges.
  for (let k = 0; k < 9; k += 1) {
    const h = 80 + ((k * 53) % 140);
    props.pushBox(W(-160 - k * 40), h / 2, W(200 + k * 220), 60, h, 60, 0x1a0f2e, 28);
    props.pushBox(W(2560 + k * 40), h / 2, W(150 + k * 230), 60, h * 0.8, 60, 0x1a0f2e, 28);
  }
  // The parked plane on the runway (logic 200, 300), nose pointing north.
  props.pushBox(W(200), 3, W(300), 7, 2.5, 34, 0xd8d8e0, 28);
  props.pushBox(W(200), 3.5, W(300), 40, 1, 9, 0xb8c8d8, 28);
  props.pushBox(W(200), 5, W(318), 10, 4, 1.5, 0xb8c8d8, 28);
  // Fountain basin at the plaza centre.
  props.pushBox(W(1200), 1, W(1200), 34, 2, 34, 0x6a6a72, 28);
  // Traffic-light poles and housings.
  for (const l of city.lights) {
    props.pushBox(W(l.x) + 8, 7, W(l.y) + 8, 1.2, 14, 1.2, 0x22222a, 28);
    props.pushBox(W(l.x) + 8, 15, W(l.y) + 8, 4, 7, 2.5, 0x16161c, 28);
  }
  const propsMesh = props.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  propsMesh.castShadow = true;
  scene.add(propsMesh);
  // Fountain water disc.
  const fountain = new THREE.Mesh(
    new THREE.CircleGeometry(15, 20),
    new THREE.MeshPhongMaterial({ color: 0x3a7ab8, shininess: 90 }),
  );
  fountain.rotation.x = -Math.PI / 2;
  fountain.position.set(W(1200), 2.1, W(1200));
  scene.add(fountain);

  // Traffic-light lamps: two small glowing spheres per light (NS and EW).
  for (const l of city.lights) {
    const ns = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2aff66 }));
    ns.position.set(W(l.x) + 8, 16.5, W(l.y) + 8);
    const ew = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    ew.position.set(W(l.x) + 8, 13.5, W(l.y) + 8);
    scene.add(ns);
    scene.add(ew);
    l.meshes = { ns, ew };
  }

  // ---- The bay: sand is in the ground mesh; the water is a shining plane.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, WORLD + 400),
    new THREE.MeshPhongMaterial({ color: 0x2a4a7a, transparent: true, opacity: 0.88, shininess: 120 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(W(WORLD) + 450, 0.35, 0);
  scene.add(water);

  // ---- Boardwalk planks along the beach, facing the bay.
  const { canvas: plankCanvas, ctx: pctx } = makeCanvas(128, 128);
  pctx.fillStyle = '#6a4a2e';
  pctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    pctx.fillStyle = y % 32 === 0 ? '#7a5636' : '#5f4026';
    pctx.fillRect(0, y, 128, 15);
  }
  const plankTex = canvasTexture(plankCanvas);
  plankTex.wrapS = THREE.RepeatWrapping;
  plankTex.wrapT = THREE.RepeatWrapping;
  plankTex.repeat.set(2, 24);
  const boardwalk = new THREE.Mesh(
    new THREE.PlaneGeometry(46, WORLD),
    new THREE.MeshLambertMaterial({ map: plankTex }),
  );
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(W(2257), 0.08, 0);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);
}

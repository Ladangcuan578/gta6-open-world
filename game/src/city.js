// Solstice City v4 — the city itself. A 12x12-block neon-sunset coastal
// city built from merged geometry: a handful of meshes instead of thousands,
// so the software renderer stays fast. World coordinates are (x, y) on the
// ground plane; three.js places them at (x, 0, y). Buildings are stored as
// {x, y, w, h} with x,y the minimum corner (the play-test reads them that way).

import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PALETTE, LANDMARKS, NEON_SIGNS } from './config.js';
import { RNG } from './rng.js';
import { mergePieces, boxMatrix, UNIT } from './merge.js';

const { BLOCK, ROAD, PITCH, HALF } = WORLD;

// ---- canvas textures -------------------------------------------------------

function gradientSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a1650');
  grad.addColorStop(0.45, '#c94b7c');
  grad.addColorStop(0.75, '#ff8c42');
  grad.addColorStop(1, '#ffb35c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function neonSignTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 96);
  g.font = 'bold 54px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 22;
  g.fillStyle = color;
  g.fillText(text, 128, 50);
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- small matrix helpers --------------------------------------------------

// Flat plane on the ground (normal +y), size w x d, optional yaw.
function groundMatrix(x, y, z, w, d, ry = 0) {
  const m = new THREE.Matrix4();
  m.makeRotationY(ry);
  m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  m.scale(new THREE.Vector3(w, d, 1));
  m.setPosition(x, y, z);
  return m;
}

// Vertical quad facing a yaw direction, size w x h.
function quadMatrix(x, y, z, w, h, ry = 0) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, 1));
  return m;
}

// ---- the city ---------------------------------------------------------------

export function buildCity(g, seed) {
  const rng = new RNG(seed);
  const scene = g.scene;
  const city = {
    buildings: [],
    landmarks: {},
    trafficLights: [],
    streetLights: [],
    trees: 0,
    sunLight: null,
    lampMeshes: null,
    heliLight: null,
  };

  // Sky, fog and lights.
  scene.background = gradientSkyTexture();
  scene.fog = new THREE.Fog(PALETTE.fog, 500, 3400);
  const hemi = new THREE.HemisphereLight(0x8a5aa8, 0x2a1a2e, 1.25);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x604060, 0.65);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xff9a4d, 1.9);
  sun.position.set(-900, 260, 500);
  // Faint eastern fill so surfaces facing away from the sunset (the rear
  // of the player's car, east building faces) are readable, not black.
  const fill = new THREE.DirectionalLight(0x8a7aa8, 1.1);
  fill.position.set(900, 300, 200);
  scene.add(fill);
  scene.add(fill.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 50;
  sun.shadow.camera.far = 2600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  city.sunLight = sun;
  // Low sun glow sprite on the western horizon.
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,243,196,1)', 'rgba(255,140,66,0)'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sunSprite.position.set(-2600, 200, 300);
  sunSprite.scale.set(900, 900, 1);
  scene.add(sunSprite);

  // ---- ground, roads, sidewalks, dashes, crosswalks -----------------------
  const groundPieces = [
    { geo: UNIT.plane, matrix: groundMatrix(0, -0.5, 350, 4600, 5600), color: 0x2e4034 },
  ];
  const roadPieces = [];
  const walkPieces = [];
  const dashPieces = [];
  const crossPieces = [];
  const roadLines = [];
  for (let k = -6; k <= 6; k++) roadLines.push(k * PITCH);
  for (const line of roadLines) {
    // Vertical road (along y) and horizontal road (along x).
    roadPieces.push(
      { geo: UNIT.plane, matrix: groundMatrix(line, 0, 0, ROAD, 2 * HALF + ROAD), color: PALETTE.road },
      { geo: UNIT.plane, matrix: groundMatrix(0, 0, line, 2 * HALF + ROAD, ROAD), color: PALETTE.road },
    );
    // Sidewalks on both sides of each road.
    for (const off of [-ROAD / 2 - 9, ROAD / 2 + 9]) {
      walkPieces.push(
        { geo: UNIT.plane, matrix: groundMatrix(line + off, 0.1, 0, 18, 2 * HALF + ROAD), color: PALETTE.sidewalk },
        { geo: UNIT.plane, matrix: groundMatrix(0, 0.1, line + off, 2 * HALF + ROAD, 18), color: PALETTE.sidewalk },
      );
    }
    // Centre dashes.
    for (let d = -HALF; d < HALF; d += 46) {
      dashPieces.push(
        { geo: UNIT.plane, matrix: groundMatrix(line, 0.15, d + 12, 3, 20), color: PALETTE.roadLine },
        { geo: UNIT.plane, matrix: groundMatrix(d + 12, 0.15, line, 20, 3), color: PALETTE.roadLine },
      );
    }
  }
  // Crosswalks at the signalized intersections.
  const signalIntersections = [];
  for (const ix of [-3, 0, 3]) {
    for (const iz of [-3, 0, 3]) signalIntersections.push([ix * PITCH, iz * PITCH]);
  }
  signalIntersections.push([0, 2 * PITCH], [2 * PITCH, 0], [-2 * PITCH, -2 * PITCH]);
  for (const [cx, cy] of signalIntersections) {
    for (let s = -3; s <= 3; s++) {
      crossPieces.push(
        { geo: UNIT.plane, matrix: groundMatrix(cx + s * 9, 0.2, cy - ROAD / 2 + 6, 5, 12), color: 0xe8e8e0 },
        { geo: UNIT.plane, matrix: groundMatrix(cx + s * 9, 0.2, cy + ROAD / 2 - 6, 5, 12), color: 0xe8e8e0 },
        { geo: UNIT.plane, matrix: groundMatrix(cx - ROAD / 2 + 6, 0.2, cy + s * 9, 12, 5), color: 0xe8e8e0 },
        { geo: UNIT.plane, matrix: groundMatrix(cx + ROAD / 2 - 6, 0.2, cy + s * 9, 12, 5), color: 0xe8e8e0 },
      );
    }
  }
  const groundMesh = new THREE.Mesh(mergePieces(groundPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  const roadMesh = new THREE.Mesh(mergePieces(roadPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
  scene.add(new THREE.Mesh(mergePieces(walkPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  scene.add(new THREE.Mesh(mergePieces(dashPieces), new THREE.MeshBasicMaterial({ vertexColors: true })));
  scene.add(new THREE.Mesh(mergePieces(crossPieces), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // ---- districts and buildings --------------------------------------------
  const blockMin = (i) => -HALF + i * PITCH + ROAD / 2;
  const specialBlocks = new Set([
    '7,6', // garage
    '8,5', // hotel
    '9,7', // bank
    '7,3', // casino
    '2,8', // port
    '5,4', // plaza
    '4,7', // palm park
    '10,8', '11,8', '10,9', '11,9', // airfield
  ]);
  function district(i, j) {
    if (i >= 5 && i <= 7 && j >= 5 && j <= 7) return 'downtown';
    if (i >= 2 && i <= 4 && j >= 4 && j <= 6) return 'oldtown';
    if (j <= 2) return 'uptown';
    if (i >= 8 && j >= 7) return 'portside';
    if (j >= 10) return 'beachfront';
    return 'mixed';
  }
  const districtColor = {
    downtown: [0x5a6a80, 0x6a7a90, 0x4a5a70],
    oldtown: [0x8a5a44, 0x7a4a38, 0x96684e],
    uptown: [0xb8a88a, 0xa89a7c, 0xc0b090],
    portside: [0x6a6a66, 0x7a7268, 0x5a5a58],
    beachfront: [0xd8b89a, 0xc8a88a, 0xe0c0a0],
    mixed: [0x7a6a7a, 0x6a7a6a, 0x8a7a6a],
  };
  const districtHeight = {
    downtown: [45, 95],
    oldtown: [18, 32],
    uptown: [25, 45],
    portside: [12, 20],
    beachfront: [10, 16],
    mixed: [20, 40],
  };
  const bodyPieces = [];
  const roofPieces = [];
  const windowPieces = [];
  const winRng = new RNG(seed * 7 + 13);

  function addBuilding(bx, by, w, h, height, color) {
    city.buildings.push({ x: bx, y: by, w, h, height });
    const cx = bx + w / 2;
    const cy = by + h / 2;
    bodyPieces.push({ geo: UNIT.box, matrix: boxMatrix(cx, height / 2, cy, w, height, h), color });
    roofPieces.push({ geo: UNIT.box, matrix: boxMatrix(cx, height + 1, cy, w - 6, 2, h - 6), color: 0x2a2a30 });
    // Lit windows (~36% warm) on the south and east faces.
    const cols = Math.max(2, Math.floor(w / 18));
    const rows = Math.max(2, Math.floor(height / 15));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = winRng.chance(0.36);
        const wc = lit ? 0xffc46a : 0x2c3e55;
        const wy = 8 + r * 15;
        if (wy > height - 6) continue;
        const wx = bx + 10 + (c + 0.5) * ((w - 20) / cols);
        windowPieces.push({ geo: UNIT.plane, matrix: quadMatrix(wx, wy, by + h + 0.4, 8, 10, 0), color: wc });
        const wz = by + 10 + (c + 0.5) * ((h - 20) / cols);
        windowPieces.push({ geo: UNIT.plane, matrix: quadMatrix(bx + w + 0.4, wy, wz, 8, 10, Math.PI / 2), color: lit ? 0xffc46a : 0x2c3e55 });
      }
    }
  }

  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      if (specialBlocks.has(`${i},${j}`)) continue;
      const d = district(i, j);
      const [hMin, hMax] = districtHeight[d];
      const colors = districtColor[d];
      const minX = blockMin(i);
      const minY = blockMin(j);
      const bw = rng.float(130, 200);
      const bh = rng.float(110, 180);
      const bx = minX + rng.float(8, BLOCK - bw - 8);
      const by = minY + rng.float(8, BLOCK - bh - 8);
      addBuilding(bx, by, bw, bh, rng.float(hMin, hMax), rng.pick(colors));
      // Some blocks get a small annex.
      if (rng.chance(0.3)) {
        const aw = rng.float(50, 80);
        const ah = rng.float(45, 70);
        const ax = minX + rng.float(8, BLOCK - aw - 8);
        const ay = minY + rng.float(8, BLOCK - ah - 8);
        if (ax + aw < bx || ax > bx + bw || ay + ah < by || ay > by + bh) {
          addBuilding(ax, ay, aw, ah, rng.float(8, 14), rng.pick(colors));
        }
      }
    }
  }
  // Landmark buildings (from config) join the same lists.
  for (const key of ['garage', 'hotel', 'bank', 'casino', 'port']) {
    const lb = LANDMARKS[key].building;
    addBuilding(lb.x, lb.y, lb.w, lb.h, key === 'bank' ? 42 : key === 'casino' ? 38 : 22, key === 'bank' ? 0x9a8a6a : key === 'casino' ? 0xb03a5a : 0x7a6a5a);
  }
  const bodyMesh = new THREE.Mesh(mergePieces(bodyPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  scene.add(bodyMesh);
  scene.add(new THREE.Mesh(mergePieces(roofPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  scene.add(new THREE.Mesh(mergePieces(windowPieces), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // ---- trees, street lights, traffic lights, signs, landmarks ------------
  const trunkPieces = [];
  const canopyPieces = [];
  const frondPieces = [];
  let treeCount = 0;
  function addTree(x, y, palm) {
    treeCount += 1;
    if (palm) {
      trunkPieces.push({ geo: UNIT.cylinder, matrix: boxMatrix(x, 7, y, 2.4, 14, 2.4), color: 0x6a4a2a });
      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        const m = new THREE.Matrix4();
        m.makeRotationY(-a);
        m.multiply(new THREE.Matrix4().makeRotationZ(0.9));
        m.multiply(new THREE.Matrix4().makeScale(3, 9, 0.8));
        m.setPosition(x + Math.cos(a) * 3.5, 15, y + Math.sin(a) * 3.5);
        frondPieces.push({ geo: UNIT.cone, matrix: m, color: 0x2a5a34 });
      }
    } else {
      trunkPieces.push({ geo: UNIT.cylinder, matrix: boxMatrix(x, 5, y, 2.2, 10, 2.2), color: 0x5a3a22 });
      canopyPieces.push({ geo: UNIT.sphere, matrix: boxMatrix(x, 13, y, 13, 9, 13), color: rng.pick([0x2e6a3a, 0x3a7a44, 0x27603a]) });
      canopyPieces.push({ geo: UNIT.sphere, matrix: boxMatrix(x + 3, 16, y - 2, 8, 6, 8), color: 0x3a7a44 });
    }
  }
  // Palm Park: a dense green square.
  for (let t = 0; t < 24; t++) {
    addTree(rng.float(-600, -376), rng.float(312, 536), rng.chance(0.4));
  }
  // Sidewalk trees along the avenues, skipping intersections.
  for (const line of roadLines) {
    for (let d = -HALF + 120; d < HALF - 60; d += 190) {
      if (Math.abs(((d % PITCH) + PITCH) % PITCH) < 70) continue;
      addTree(line + ROAD / 2 + 16, d, rng.chance(0.45));
      addTree(line - ROAD / 2 - 16, d + 95, rng.chance(0.45));
      addTree(d, line + ROAD / 2 + 16, rng.chance(0.45));
      addTree(d + 95, line - ROAD / 2 - 16, rng.chance(0.45));
    }
  }
  // Beachfront palms along the sand.
  for (let x = -1900; x < 1900; x += 130) {
    addTree(x + rng.float(-20, 20), 1905, true);
  }
  city.trees = treeCount;
  const trunkMesh = new THREE.Mesh(mergePieces(trunkPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  trunkMesh.castShadow = true;
  scene.add(trunkMesh);
  scene.add(new THREE.Mesh(mergePieces(canopyPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  scene.add(new THREE.Mesh(mergePieces(frondPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));

  // Street lights: pole, head, and a warm pool of light on the road.
  const polePieces = [];
  const poolPieces = [];
  const headPieces = [];
  const lightPositions = [];
  for (const line of roadLines) {
    for (let d = -HALF + 200; d < HALF; d += 300) {
      const side = (Math.floor(d / 300) % 2 === 0) ? 1 : -1;
      const lx = line + side * (ROAD / 2 + 12);
      const lz = d;
      lightPositions.push([lx, lz]);
      polePieces.push({ geo: UNIT.cylinder, matrix: boxMatrix(lx, 8, lz, 1.2, 16, 1.2), color: 0x2a2a30 });
      headPieces.push({ geo: UNIT.box, matrix: boxMatrix(lx - side * 4, 16, lz, 8, 1.2, 2), color: 0xffd27a });
      poolPieces.push({ geo: UNIT.plane, matrix: groundMatrix(lx - side * 6, 0.25, lz, 52, 52), color: 0xffc46a });
      lightPositions.push([d, line + side * (ROAD / 2 + 12)]);
      polePieces.push({ geo: UNIT.cylinder, matrix: boxMatrix(d, 8, line + side * (ROAD / 2 + 12), 1.2, 16, 1.2), color: 0x2a2a30 });
      headPieces.push({ geo: UNIT.box, matrix: boxMatrix(d, 16, line + side * (ROAD / 2 + 12) - side * 4, 2, 1.2, 8), color: 0xffd27a });
      poolPieces.push({ geo: UNIT.plane, matrix: groundMatrix(d, 0.25, line + side * (ROAD / 2 + 12) - side * 6, 52, 52), color: 0xffc46a });
    }
  }
  city.streetLights = lightPositions;
  scene.add(new THREE.Mesh(mergePieces(polePieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  scene.add(new THREE.Mesh(mergePieces(headPieces), new THREE.MeshBasicMaterial({ vertexColors: true })));
  const poolMesh = new THREE.Mesh(
    mergePieces(poolPieces),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(poolMesh);

  // Traffic lights on an 8-second cycle: north-south green 0-4s, east-west
  // green 4-8s. Four merged lamp meshes toggle visibility with the phase.
  const tlPolePieces = [];
  const tlHousePieces = [];
  const nsRed = [];
  const nsGreen = [];
  const ewRed = [];
  const ewGreen = [];
  for (const [cx, cy] of signalIntersections) {
    tlPolePieces.push({ geo: UNIT.cylinder, matrix: boxMatrix(cx + 42, 9, cy + 42, 1.6, 18, 1.6), color: 0x2a2a30 });
    tlPolePieces.push({ geo: UNIT.box, matrix: boxMatrix(cx + 21, 17.5, cy + 42, 42, 1.4, 1.4), color: 0x2a2a30 });
    tlHousePieces.push({ geo: UNIT.box, matrix: boxMatrix(cx, 15, cy - 40, 5, 8, 3), color: 0x1a1a1e });
    tlHousePieces.push({ geo: UNIT.box, matrix: boxMatrix(cx - 40, 15, cy, 3, 8, 5), color: 0x1a1a1e });
    nsRed.push({ geo: UNIT.box, matrix: boxMatrix(cx, 15, cy - 42, 4, 7, 1), color: 0xff2a2a });
    nsGreen.push({ geo: UNIT.box, matrix: boxMatrix(cx, 15, cy - 42, 4, 7, 1), color: 0x2aff5e });
    ewRed.push({ geo: UNIT.box, matrix: boxMatrix(cx - 42, 15, cy, 1, 7, 4), color: 0xff2a2a });
    ewGreen.push({ geo: UNIT.box, matrix: boxMatrix(cx - 42, 15, cy, 1, 7, 4), color: 0x2aff5e });
  }
  city.trafficLights = signalIntersections.map(([x, y]) => ({ x, y }));
  scene.add(new THREE.Mesh(mergePieces(tlPolePieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  scene.add(new THREE.Mesh(mergePieces(tlHousePieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  const lampMat = (c) => new THREE.MeshBasicMaterial({ vertexColors: true, color: c });
  city.lampMeshes = {
    nsRed: new THREE.Mesh(mergePieces(nsRed), lampMat(0xffffff)),
    nsGreen: new THREE.Mesh(mergePieces(nsGreen), lampMat(0xffffff)),
    ewRed: new THREE.Mesh(mergePieces(ewRed), lampMat(0xffffff)),
    ewGreen: new THREE.Mesh(mergePieces(ewGreen), lampMat(0xffffff)),
  };
  for (const m of Object.values(city.lampMeshes)) scene.add(m);
  city.setLightPhase = (t) => {
    const nsGo = (t % 8) < 4;
    city.lampMeshes.nsGreen.visible = nsGo;
    city.lampMeshes.nsRed.visible = !nsGo;
    city.lampMeshes.ewGreen.visible = !nsGo;
    city.lampMeshes.ewRed.visible = nsGo;
  };
  city.setLightPhase(0);

  // Neon signs on building faces along the main avenues.
  const signBuildings = city.buildings
    .filter((b) => Math.abs(b.y + b.h / 2) < 900 && b.height > 25)
    .slice(0, 12);
  signBuildings.forEach((b, i) => {
    const text = NEON_SIGNS[i % NEON_SIGNS.length];
    const color = '#' + new THREE.Color(PALETTE.neon[i % PALETTE.neon.length]).getHexString();
    const mat = new THREE.MeshBasicMaterial({ map: neonSignTexture(text, color), transparent: true, side: THREE.DoubleSide });
    const w = Math.min(64, b.w * 0.55);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), mat);
    mesh.position.set(b.x + b.w / 2, b.height * 0.62, b.y + b.h + 0.6);
    scene.add(mesh);
  });

  // Water tower in Palm Park.
  {
    const tx = -560;
    const ty = 500;
    const legPieces = [];
    for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
      legPieces.push({ geo: UNIT.cylinder, matrix: boxMatrix(tx + dx, 15, ty + dz, 1.6, 30, 1.6), color: 0x8a8a90 });
    }
    scene.add(new THREE.Mesh(mergePieces(legPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 20, 14), new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.6 }));
    tank.position.set(tx, 40, ty);
    tank.castShadow = true;
    scene.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(16, 8, 14), new THREE.MeshStandardMaterial({ color: 0x8a2a3a, roughness: 0.8 }));
    roof.position.set(tx, 54, ty);
    scene.add(roof);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    beacon.position.set(tx, 59, ty);
    scene.add(beacon);
  }

  // Distant skyline silhouettes, fog-faded.
  {
    const skyPieces = [];
    const skyRng = new RNG(seed + 99);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 2500 + skyRng.float(0, 350);
      const w = skyRng.float(100, 260);
      const h = skyRng.float(120, 330);
      skyPieces.push({ geo: UNIT.box, matrix: boxMatrix(Math.cos(a) * r, h / 2, Math.sin(a) * r + 200, w, h, w), color: 0x241535 });
    }
    scene.add(new THREE.Mesh(mergePieces(skyPieces), new THREE.MeshBasicMaterial({ vertexColors: true })));
  }

  // Beach, bay and boardwalk along the south edge.
  {
    const sand = new THREE.Mesh(mergePieces([
      { geo: UNIT.plane, matrix: groundMatrix(0, 0.05, 1923, 4200, 134), color: PALETTE.sand },
    ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    scene.add(sand);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 900),
      new THREE.MeshStandardMaterial({ color: 0x2a6a8a, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92, emissive: 0x14384e }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.4, 2440);
    scene.add(water);
    const foam = new THREE.Mesh(mergePieces([
      { geo: UNIT.plane, matrix: groundMatrix(0, 0.6, 1992, 4200, 6), color: 0xf0f0e8 },
    ]), new THREE.MeshBasicMaterial({ vertexColors: true }));
    scene.add(foam);
    // Boardwalk planks, rails and benches.
    const plankPieces = [];
    const railPieces = [];
    for (let x = -700; x < 700; x += 30) {
      plankPieces.push({ geo: UNIT.box, matrix: boxMatrix(x + 15, 1.2, 1880, 28, 2.4, 36), color: rng.pick([0x8a6a44, 0x7a5a38, 0x966e48]) });
    }
    railPieces.push(
      { geo: UNIT.box, matrix: boxMatrix(0, 3.5, 1863, 1400, 1.4, 1.4), color: 0x5a4632 },
      { geo: UNIT.box, matrix: boxMatrix(0, 3.5, 1897, 1400, 1.4, 1.4), color: 0x5a4632 },
    );
    for (let x = -600; x <= 600; x += 300) {
      railPieces.push({ geo: UNIT.box, matrix: boxMatrix(x, 2, 1863, 3, 4, 3), color: 0x5a4632 });
      railPieces.push({ geo: UNIT.box, matrix: boxMatrix(x, 2, 1897, 3, 4, 3), color: 0x5a4632 });
      railPieces.push({ geo: UNIT.box, matrix: boxMatrix(x, 2.5, 1888, 14, 1.6, 5), color: 0x6a5240 });
    }
    const planks = new THREE.Mesh(mergePieces(plankPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    planks.receiveShadow = true;
    scene.add(planks);
    scene.add(new THREE.Mesh(mergePieces(railPieces), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  }

  // Airfield: runway, dashes, hangar, windsock.
  {
    const runway = new THREE.Mesh(mergePieces([
      { geo: UNIT.plane, matrix: groundMatrix(1537, 0.3, 912, 575, 100), color: PALETTE.runway },
    ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    runway.receiveShadow = true;
    scene.add(runway);
    const dashPieces = [];
    for (let x = 1280; x < 1800; x += 60) {
      dashPieces.push({ geo: UNIT.plane, matrix: groundMatrix(x, 0.35, 912, 30, 4), color: 0xf0f0e8 });
    }
    scene.add(new THREE.Mesh(mergePieces(dashPieces), new THREE.MeshBasicMaterial({ vertexColors: true })));
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(120, 42, 70), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7 }));
    hangar.position.set(1400, 21, 1080);
    hangar.castShadow = true;
    scene.add(hangar);
    const sockPole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 22, 8), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    sockPole.position.set(1300, 11, 860);
    scene.add(sockPole);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1f }));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(1306, 21, 860);
    scene.add(sock);
  }

  // Solstice Plaza: stone disc and the fountain.
  {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(72, 72, 2, 28), new THREE.MeshStandardMaterial({ color: PALETTE.plazaStone, roughness: 1 }));
    disc.position.set(-152, 1, -456);
    disc.receiveShadow = true;
    scene.add(disc);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(17, 19, 4, 18), new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.8 }));
    basin.position.set(-152, 2, -456);
    scene.add(basin);
    const waterDisc = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 1, 18), new THREE.MeshStandardMaterial({ color: 0x2f7ea8, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.85 }));
    waterDisc.position.set(-152, 4.5, -456);
    scene.add(waterDisc);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.9 }));
    column.position.set(-152, 9, -456);
    scene.add(column);
    const spray = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 10), new THREE.MeshStandardMaterial({ color: 0x9fd8f0, transparent: true, opacity: 0.55, roughness: 0.2 }));
    spray.position.set(-152, 17, -456);
    scene.add(spray);
  }

  // Palm Park grass and paths.
  {
    const park = new THREE.Mesh(mergePieces([
      { geo: UNIT.plane, matrix: groundMatrix(-488, 0.05, 424, 240, 240), color: PALETTE.grass },
      { geo: UNIT.plane, matrix: groundMatrix(-488, 0.15, 424, 240, 14), color: 0xc8b890 },
      { geo: UNIT.plane, matrix: groundMatrix(-488, 0.15, 424, 14, 240), color: 0xc8b890 },
    ]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    park.receiveShadow = true;
    scene.add(park);
  }

  // Landmark registry for missions and the play-test.
  city.landmarks = {
    garage: { arrival: { ...LANDMARKS.garage.arrival } },
    hotel: { arrival: { ...LANDMARKS.hotel.arrival } },
    plaza: { arrival: { ...LANDMARKS.plaza.arrival } },
    bank: { arrival: { ...LANDMARKS.bank.arrival } },
    airport: { arrival: { ...LANDMARKS.airport.arrival } },
    port: { arrival: { ...LANDMARKS.port.arrival } },
    casino: { arrival: { ...LANDMARKS.casino.arrival } },
    oldtown: { arrival: { ...LANDMARKS.oldtown.arrival } },
    boardwalk: { arrival: { ...LANDMARKS.boardwalk.arrival } },
  };
  city.spawn = { ...LANDMARKS.spawn };

  return city;
}

// ---- helpers used by vehicles, player and police ---------------------------

export function isRoad(city, x, y) {
  for (let k = -6; k <= 6; k++) {
    const line = k * PITCH;
    if (Math.abs(x - line) <= ROAD / 2 + 4) return true;
    if (Math.abs(y - line) <= ROAD / 2 + 4) return true;
  }
  return false;
}

export function isBlocked(city, x, y, r = 0) {
  if (Math.abs(x) > 2080 || y < -1920 || y > 1985) return true;
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// Push a circle out of every building AABB it overlaps. Returns a fresh point.
export function resolveCollision(city, x, y, r) {
  let nx = x;
  let ny = y;
  for (const b of city.buildings) {
    if (nx + r > b.x && nx - r < b.x + b.w && ny + r > b.y && ny - r < b.y + b.h) {
      const pushL = nx + r - b.x;
      const pushR = b.x + b.w - (nx - r);
      const pushT = ny + r - b.y;
      const pushB = b.y + b.h - (ny - r);
      const m = Math.min(pushL, pushR, pushT, pushB);
      if (m === pushL) nx = b.x - r;
      else if (m === pushR) nx = b.x + b.w + r;
      else if (m === pushT) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  nx = Math.max(-2080, Math.min(2080, nx));
  ny = Math.max(-1920, Math.min(1985, ny));
  return { x: nx, y: ny };
}

export function randomRoadPoint(city, rng) {
  const axis = rng.chance(0.5) ? 'x' : 'y';
  const line = rng.pick([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) * PITCH;
  const along = rng.float(-1700, 1700);
  const dir = rng.chance(0.5) ? 1 : -1;
  if (axis === 'x') return { x: along, y: line, axis, dir };
  return { x: line, y: along, axis, dir };
}

// Traffic-light state for a car moving along an axis at time t (seconds).
// North-south green 0-4s, east-west green 4-8s, on an 8-second cycle.
export function lightState(axis, t) {
  const phase = ((t % 8) + 8) % 8;
  if (axis === 'ns') return phase < 4 ? 'green' : 'red';
  return phase >= 4 ? 'green' : 'red';
}


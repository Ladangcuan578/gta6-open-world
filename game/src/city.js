// Solstice City — the city itself: a seeded grid of blocks, roads, parks,
// a beach and a bay, plus every query the cars, pedestrians and missions use
// (is this a road? does this circle hit a building? where is the nearest road?).
import { CFG, PAL } from './config.js';
import { makeRng, clamp } from './random.js';

export const WORLD_W = CFG.GRID * CFG.PITCH;
export const WORLD_H = CFG.GRID * CFG.PITCH + CFG.BEACH + CFG.BAY;

const ROAD_HALF = CFG.ROAD / 2;

// Fixed landmarks, by block coordinates (bx, by): garage (safehouse) north-west,
// bank east, hospital south-west, plaza centre, parks scattered, airstrip north-east.
const LANDMARKS = {
  garage: { bx: 1, by: 1, label: 'Vera\u2019s Garage' },
  bank: { bx: 9, by: 3, label: 'Solstice Bank' },
  hospital: { bx: 2, by: 9, label: 'General Hospital' },
  plaza: { bx: 5, by: 5, label: 'Plaza del Sol' },
  parkA: { bx: 8, by: 8, label: 'Palm Park' },
  parkB: { bx: 3, by: 6, label: 'Jacaranda Park' },
  parkC: { bx: 9, by: 10, label: 'Marina Park' },
  airstrip: { bx: 10, by: 1, label: 'Solstice Airstrip' },
};

export function blockRect(bx, by) {
  return {
    x: bx * CFG.PITCH + ROAD_HALF,
    y: by * CFG.PITCH + ROAD_HALF,
    w: CFG.BLOCK,
    h: CFG.BLOCK,
  };
}

export function blockCenter(bx, by) {
  const r = blockRect(bx, by);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const parks = [];
  const runways = [];
  const trees = [];
  const landmarks = {};
  for (const [key, lm] of Object.entries(LANDMARKS)) {
    const c = blockCenter(lm.bx, lm.by);
    // The arrival point is where a car can actually stop: the road just south
    // of the block (the runway itself for the airstrip). Mission markers and
    // completion checks use this, never the block centre, which sits inside
    // a building for most landmarks.
    const arrival = key === 'airstrip'
      ? { x: c.x, y: c.y }
      : nearestRoadPoint(c.x, c.y + CFG.BLOCK / 2 + CFG.ROAD);
    landmarks[key] = { ...lm, x: c.x, y: c.y, arrival };
  }
  const parkKeys = new Set(['plaza', 'parkA', 'parkB', 'parkC']);
  for (let by = 0; by < CFG.GRID; by += 1) {
    for (let bx = 0; bx < CFG.GRID; bx += 1) {
      const key = Object.keys(LANDMARKS).find(
        (k) => LANDMARKS[k].bx === bx && LANDMARKS[k].by === by,
      );
      const r = blockRect(bx, by);
      if (key === 'airstrip') {
        // A runway strip across the block, with a hangar at its north edge.
        // The strip itself is drivable ground, not a building.
        runways.push({ x: r.x, y: r.y + r.h / 2 - 22, w: r.w, h: 44 });
        buildings.push({
          x: r.x + 14, y: r.y + 10, w: 70, h: 44,
          roof: '#8a9ab0', wall: '#dccbb2', kind: 'hangar', label: 'Hangar',
        });
        continue;
      }
      if (key && parkKeys.has(key)) {
        parks.push({ ...r, kind: key === 'plaza' ? 'plaza' : 'park', label: LANDMARKS[key].label });
        const treeCount = key === 'plaza' ? 8 : 14;
        for (let i = 0; i < treeCount; i += 1) {
          trees.push({
            x: r.x + 18 + rng.next() * (r.w - 36),
            y: r.y + 18 + rng.next() * (r.h - 36),
            r: 7 + rng.next() * 6,
          });
        }
        continue;
      }
      // A block holds one big building or two smaller ones.
      const roof = rng.pick(PAL.roofs);
      const wall = rng.pick(PAL.walls);
      if (rng.chance(0.45)) {
        buildings.push({
          x: r.x + 16, y: r.y + 16, w: r.w - 32, h: r.h - 32,
          roof, wall, kind: key || 'block', label: key ? LANDMARKS[key].label : null,
        });
      } else {
        const vertical = rng.chance(0.5);
        if (vertical) {
          buildings.push({
            x: r.x + 14, y: r.y + 14, w: r.w / 2 - 20, h: r.h - 28,
            roof, wall, kind: key || 'block', label: key ? LANDMARKS[key].label : null,
          });
          buildings.push({
            x: r.x + r.w / 2 + 6, y: r.y + 14, w: r.w / 2 - 20, h: r.h - 28,
            roof: rng.pick(PAL.roofs), wall: rng.pick(PAL.walls), kind: 'block', label: null,
          });
        } else {
          buildings.push({
            x: r.x + 14, y: r.y + 14, w: r.w - 28, h: r.h / 2 - 20,
            roof, wall, kind: key || 'block', label: key ? LANDMARKS[key].label : null,
          });
          buildings.push({
            x: r.x + 14, y: r.y + r.h / 2 + 6, w: r.w - 28, h: r.h / 2 - 20,
            roof: rng.pick(PAL.roofs), wall: rng.pick(PAL.walls), kind: 'block', label: null,
          });
        }
      }
    }
  }
  return { buildings, parks, runways, trees, landmarks, rng };
}

// Is the point on a road (within a road's half width of a grid line)?
export function isRoad(x, y) {
  if (x < 0 || y < 0 || x > WORLD_W || y > WORLD_H) return false;
  const rx = ((x % CFG.PITCH) + CFG.PITCH) % CFG.PITCH;
  const ry = ((y % CFG.PITCH) + CFG.PITCH) % CFG.PITCH;
  const onV = rx <= ROAD_HALF || rx >= CFG.PITCH - ROAD_HALF;
  const onH = ry <= ROAD_HALF || ry >= CFG.PITCH - ROAD_HALF;
  return (onV && y <= WORLD_W) || (onH && x <= WORLD_W);
}

export function isWater(x, y) {
  return y > WORLD_W + CFG.BEACH;
}

export function isBeach(x, y) {
  return y > WORLD_W && y <= WORLD_W + CFG.BEACH;
}

// The nearest point on the road network to (x, y).
export function nearestRoadPoint(x, y) {
  const cx = clamp(x, 0, WORLD_W);
  const cy = clamp(y, 0, WORLD_W);
  const lineX = Math.round(cx / CFG.PITCH) * CFG.PITCH;
  const lineY = Math.round(cy / CFG.PITCH) * CFG.PITCH;
  const dx = Math.abs(cx - lineX);
  const dy = Math.abs(cy - lineY);
  if (dx <= dy) return { x: lineX, y: cy };
  return { x: cx, y: lineY };
}

// A random point on a road, at least `minDist` from (fx, fy) when given.
export function randomRoadPoint(rng, fx = null, fy = null, minDist = 0) {
  for (let tries = 0; tries < 40; tries += 1) {
    const vertical = rng.chance(0.5);
    const line = rng.int(0, CFG.GRID) * CFG.PITCH;
    const along = rng.range(0, WORLD_W);
    const p = vertical ? { x: line, y: along } : { x: along, y: line };
    if (fx === null || Math.hypot(p.x - fx, p.y - fy) >= minDist) return p;
  }
  return { x: CFG.PITCH, y: CFG.PITCH };
}

// Circle vs building rects: returns the building hit, or null.
export function hitBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}

// Push a circle out of buildings and the world edge; returns true if pushed.
export function resolveBuildingCollision(city, body, r) {
  const b = hitBuilding(city, body.x, body.y, r);
  if (b) {
    const overlapL = body.x + r - b.x;
    const overlapR = b.x + b.w - (body.x - r);
    const overlapT = body.y + r - b.y;
    const overlapB = b.y + b.h - (body.y - r);
    const min = Math.min(overlapL, overlapR, overlapT, overlapB);
    if (min === overlapL) body.x = b.x - r;
    else if (min === overlapR) body.x = b.x + b.w + r;
    else if (min === overlapT) body.y = b.y - r;
    else body.y = b.y + b.h + r;
    return true;
  }
  if (body.x < r) { body.x = r; return true; }
  if (body.y < r) { body.y = r; return true; }
  if (body.x > WORLD_W - r) { body.x = WORLD_W - r; return true; }
  if (body.y > WORLD_H - r) { body.y = WORLD_H - r; return true; }
  return false;
}

// Pre-render the whole static city once, to an offscreen canvas.
export function prerenderCity(city) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  const c = canvas.getContext('2d');
  // Base: grass everywhere, so blocks read as ground.
  c.fillStyle = PAL.grass;
  c.fillRect(0, 0, WORLD_W, WORLD_H);
  // Beach and bay south of the city.
  c.fillStyle = PAL.sand;
  c.fillRect(0, WORLD_W, WORLD_W, CFG.BEACH);
  c.fillStyle = PAL.water;
  c.fillRect(0, WORLD_W + CFG.BEACH, WORLD_W, CFG.BAY);
  c.fillStyle = PAL.waterDeep;
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 173) % WORLD_W;
    const y = WORLD_W + CFG.BEACH + 30 + ((i * 97) % (CFG.BAY - 60));
    c.fillRect(x, y, 60 + (i % 3) * 30, 3);
  }
  // Umbrellas on the beach.
  const beachColors = ['#e8590c', '#2e6fc2', '#e8b73a', '#c23b8a'];
  for (let i = 0; i < 10; i += 1) {
    const x = 120 + i * 300;
    const y = WORLD_W + CFG.BEACH / 2;
    c.fillStyle = beachColors[i % beachColors.length];
    c.beginPath();
    c.arc(x, y, 14, Math.PI, 0);
    c.fill();
    c.fillStyle = '#6b4a2f';
    c.fillRect(x - 1, y, 2, 14);
  }
  // Roads: asphalt strips on every grid line.
  c.fillStyle = PAL.asphalt;
  for (let i = 0; i <= CFG.GRID; i += 1) {
    const p = i * CFG.PITCH;
    c.fillRect(p - ROAD_HALF, 0, CFG.ROAD, WORLD_W);
    c.fillRect(0, p - ROAD_HALF, WORLD_W, CFG.ROAD);
  }
  // Sidewalks: a border around every block.
  for (let by = 0; by < CFG.GRID; by += 1) {
    for (let bx = 0; bx < CFG.GRID; bx += 1) {
      const r = blockRect(bx, by);
      c.fillStyle = PAL.sidewalk;
      c.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    }
  }
  // Parks and plaza.
  for (const p of city.parks) {
    c.fillStyle = p.kind === 'plaza' ? '#d8c49a' : PAL.grassDark;
    c.fillRect(p.x, p.y, p.w, p.h);
    if (p.kind === 'plaza') {
      c.fillStyle = '#7fa8c9';
      c.beginPath();
      c.arc(p.x + p.w / 2, p.y + p.h / 2, 26, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#e8e4da';
      c.beginPath();
      c.arc(p.x + p.w / 2, p.y + p.h / 2, 18, 0, Math.PI * 2);
      c.fill();
    }
  }
  // Trees.
  for (const t of city.trees) {
    c.fillStyle = 'rgba(20, 16, 10, 0.25)';
    c.beginPath();
    c.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#4e7d33';
    c.beginPath();
    c.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#6a9a48';
    c.beginPath();
    c.arc(t.x - 2, t.y - 2, t.r * 0.6, 0, Math.PI * 2);
    c.fill();
  }
  // Runways: dark asphalt strips with white dashes.
  for (const rw of city.runways) {
    c.fillStyle = '#33363e';
    c.fillRect(rw.x, rw.y, rw.w, rw.h);
    c.fillStyle = '#eef1f4';
    for (let x = rw.x + 10; x < rw.x + rw.w - 10; x += 36) {
      c.fillRect(x, rw.y + rw.h / 2 - 2, 20, 4);
    }
    c.fillStyle = '#e8c85a';
    c.fillRect(rw.x, rw.y, rw.w, 3);
    c.fillRect(rw.x, rw.y + rw.h - 3, rw.w, 3);
  }
  // Buildings: shadow, walls, roof, roof details.
  for (const b of city.buildings) {
    c.fillStyle = PAL.buildingShadow;
    c.fillRect(b.x + 10, b.y + 12, b.w, b.h);
    c.fillStyle = b.wall;
    c.fillRect(b.x, b.y, b.w, b.h);
    c.fillStyle = b.roof;
    c.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(b.x + 6, b.y + 6, b.w - 12, 5);
    // Rooftop details: AC units and skylights.
    c.fillStyle = 'rgba(0,0,0,0.22)';
    const units = Math.max(1, Math.floor((b.w * b.h) / 9000));
    for (let i = 0; i < units; i += 1) {
      const ux = b.x + 14 + ((i * 47) % Math.max(20, b.w - 34));
      const uy = b.y + 16 + ((i * 31) % Math.max(20, b.h - 36));
      c.fillRect(ux, uy, 12, 9);
    }
    if (b.label) {
      c.fillStyle = 'rgba(20,16,10,0.75)';
      c.font = 'bold 13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }
  }
  // Road markings: centre dashes and crosswalks.
  c.fillStyle = PAL.roadLine;
  for (let i = 0; i <= CFG.GRID; i += 1) {
    const p = i * CFG.PITCH;
    for (let d = 0; d < WORLD_W; d += 64) {
      c.fillRect(p - 2, d, 4, 30);
      c.fillRect(d, p - 2, 30, 4);
    }
  }
  // Dusk extras: solid white edge lines so the avenues read at sunset,
  // pale parking bays along the east side of every third avenue, and a
  // planked boardwalk facing the bay.
  c.strokeStyle = 'rgba(238, 238, 228, 0.45)';
  c.lineWidth = 2.5;
  for (let i = 0; i <= CFG.GRID; i += 1) {
    const p = i * CFG.PITCH;
    const e1 = p - ROAD_HALF + 5;
    const e2 = p + ROAD_HALF - 5;
    c.beginPath(); c.moveTo(e1, 0); c.lineTo(e1, WORLD_W); c.stroke();
    c.beginPath(); c.moveTo(e2, 0); c.lineTo(e2, WORLD_W); c.stroke();
    c.beginPath(); c.moveTo(0, e1); c.lineTo(WORLD_W, e1); c.stroke();
    c.beginPath(); c.moveTo(0, e2); c.lineTo(WORLD_W, e2); c.stroke();
  }
  c.fillStyle = 'rgba(220, 220, 210, 0.30)';
  for (let gx = 0; gx < CFG.GRID; gx += 3) {
    const x = gx * CFG.PITCH + ROAD_HALF - 14;
    for (let gy = 0; gy < CFG.GRID; gy += 1) {
      const y = gy * CFG.PITCH + ROAD_HALF + 40;
      for (let s = 0; s < 3; s += 1) c.fillRect(x, y + s * 56, 10, 40);
    }
  }
  c.fillStyle = '#c9a87e';
  c.fillRect(0, WORLD_W + 4, WORLD_W, 10);
  c.fillStyle = 'rgba(120, 90, 50, 0.5)';
  for (let x = 0; x < WORLD_W; x += 18) c.fillRect(x, WORLD_W + 4, 2, 10);
  return canvas;
}

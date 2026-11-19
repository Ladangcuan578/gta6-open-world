// Solstice City — pedestrians: people walking the sidewalks who go about
// their day, and run when a car screams past or a gun goes off.
import { CFG } from './config.js';
import { makeRng, clamp } from './random.js';
import { WORLD_W, blockRect, isRoad } from './city.js';

const SHIRTS = ['#e8b73a', '#3aa655', '#c23b8a', '#2e6fc2', '#e8e4da', '#7a4a9e', '#d97b2e', '#4a9e8a'];

export function makePed(x, y, angle, rng) {
  return {
    x, y, angle,
    speed: rng.range(45, 75),
    shirt: SHIRTS[Math.floor(rng.next() * SHIRTS.length)],
    skin: rng.pick(['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0']),
    walkPhase: rng.next() * Math.PI * 2,
    cap: rng.chance(0.3), // a third of the crowd wears a cap at dusk
    target: null,
    fleeTimer: 0,
    down: false,
    downTimer: 0,
  };
}

// A point on a sidewalk edge of a random block.
function sidewalkPoint(rng) {
  const bx = rng.int(0, CFG.GRID - 1);
  const by = rng.int(0, CFG.GRID - 1);
  const r = blockRect(bx, by);
  const side = rng.int(0, 3);
  if (side === 0) return { x: r.x + rng.range(0, r.w), y: r.y - 6 };
  if (side === 1) return { x: r.x + rng.range(0, r.w), y: r.y + r.h + 6 };
  if (side === 2) return { x: r.x - 6, y: r.y + rng.range(0, r.h) };
  return { x: r.x + r.w + 6, y: r.y + rng.range(0, r.h) };
}

export function spawnPeds(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) {
    const p = sidewalkPoint(rng);
    const ped = makePed(p.x, p.y, rng.next() * Math.PI * 2, rng);
    ped.target = sidewalkPoint(rng);
    peds.push(ped);
  }
  return peds;
}

export function scarePeds(peds, x, y, radius) {
  for (const ped of peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.fleeTimer = 2.2;
      const a = Math.atan2(ped.y - y, ped.x - x);
      ped.target = {
        x: clamp(ped.x + Math.cos(a) * 260, 20, WORLD_W - 20),
        y: clamp(ped.y + Math.sin(a) * 260, 20, WORLD_W - 20),
      };
    }
  }
}

export function updatePeds(peds, dt, rng) {
  for (const ped of peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) ped.down = false;
      continue;
    }
    if (!ped.target) ped.target = sidewalkPoint(rng);
    const dx = ped.target.x - ped.x;
    const dy = ped.target.y - ped.y;
    const d = Math.hypot(dx, dy);
    if (d < 10) {
      ped.target = sidewalkPoint(rng);
      continue;
    }
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += clamp(diff * 4, -3.2 * dt, 3.2 * dt);
    const speed = ped.fleeTimer > 0 ? ped.speed * 2.4 : ped.speed;
    if (ped.fleeTimer > 0) ped.fleeTimer -= dt;
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    ped.walkPhase += dt * (ped.fleeTimer > 0 ? 14 : 7);
    // Stay out of the water and the world edge.
    ped.x = clamp(ped.x, 12, WORLD_W - 12);
    ped.y = clamp(ped.y, 12, WORLD_W + 40);
  }
}

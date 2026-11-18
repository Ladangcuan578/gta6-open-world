// Solstice City — boot and the one loop: input every frame, the world in
// fixed 1/60 s steps, and the renderer painting what is there. Screens:
// title, playing, paused, busted, wasted, story. ?shot=drive|chase|mission|
// foot|start stages that scene instead of the loop and sets window.__shotReady.
import { CFG } from './config.js';
import { makeRng, clamp } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import {
  WORLD_W, WORLD_H, buildCity, prerenderCity, randomRoadPoint,
  resolveBuildingCollision,
} from './city.js';
import {
  makeCar, spawnTraffic, spawnParked, updateTraffic, updatePolice,
  spawnPolice, damageCar,
} from './vehicles.js';
import { spawnPeds, updatePeds, scarePeds, makePed } from './pedestrians.js';
import { Player } from './player.js';
import { MissionManager } from './missions.js';
import { Camera, renderWorld } from './render.js';
import { Hud } from './hud.js';
import { saveGame, loadSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261118;

const canvas = document.getElementById('game');
const status = document.getElementById('status');

function createGame(seedValue) {
  const rng = makeRng(seedValue);
  const city = buildCity(seedValue);
  const cityCanvas = prerenderCity(city);
  const audio = new AudioSys();
  const input = new Input(canvas);
  const game = {
    seed: seedValue,
    rng,
    city,
    cityCanvas,
    audio,
    input,
    state: 'title',
    time: 0,
    clock: 0, // seconds since 08:00
    viewW: window.innerWidth,
    viewH: window.innerHeight,
    camera: new Camera(),
    events: { busted: false, wasted: false },
    saveTimer: 0,
    bullets: [],
    particles: [],
    skids: [],
    cars: [],
    peds: [],
  };
  game.player = new Player(city.landmarks.garage.x, city.landmarks.garage.y + 60);
  game.missions = new MissionManager(game);
  game.hud = new Hud(game);
  game.hud.buildMinimapBase(cityCanvas);

  game.toast = (msg) => game.hud.toast(msg);
  game.showBrief = (title, text, giver) => game.hud.showBrief(title, text, giver);
  game.showStoryComplete = () => {
    game.state = 'story';
    game.hud.showStory();
  };
  game.saveGame = () => saveGame(game);
  game.randomRoadPointFar = (x, y, minDist) => randomRoadPoint(game.rng, x, y, minDist);
  game.removeCar = (car) => {
    const i = game.cars.indexOf(car);
    if (i !== -1) game.cars.splice(i, 1);
  };
  game.spawnFleeingDriver = (car) => {
    const ped = makePed(car.x + 30, car.y + 10, 0, game.rng);
    ped.fleeTimer = 3;
    ped.target = {
      x: clamp(car.x + 300, 20, WORLD_W - 20),
      y: clamp(car.y - 200, 20, WORLD_W - 20),
    };
    return ped;
  };
  game.spawnMissionVan = (x, y) => {
    const van = makeCar(x, y, 0, 'van', '#3a6ea5', { driver: 'mission' });
    van.targetSpeed = 130;
    van.waypoint = { x: CFG.PITCH, y: CFG.PITCH };
    van.corners = [
      { x: CFG.PITCH, y: CFG.PITCH },
      { x: 11 * CFG.PITCH, y: CFG.PITCH },
      { x: 11 * CFG.PITCH, y: 11 * CFG.PITCH },
      { x: CFG.PITCH, y: 11 * CFG.PITCH },
    ];
    van.corner = 0;
    game.cars.push(van);
    return van;
  };

  game.reset = () => {
    game.cars = [];
    game.peds = [];
    game.bullets = [];
    game.particles = [];
    game.skids = [];
    game.events = { busted: false, wasted: false };
    game.clock = 0;
    game.saveTimer = 0;
    game.player = new Player(city.landmarks.garage.x, city.landmarks.garage.y + 60);
    game.missions = new MissionManager(game);
    const gx = city.landmarks.garage.x;
    const gy = city.landmarks.garage.y;
    game.cars.push(...spawnTraffic(city, game.rng, CFG.TRAFFIC_COUNT, gx, gy, 260));
    game.cars.push(...spawnParked(city, game.rng, 8, gx, gy, 200));
    game.peds.push(...spawnPeds(game.rng, CFG.PED_COUNT));
    game.camera.snap(game.player.x, game.player.y, game.viewW, game.viewH);
  };
  game.reset();
  return game;
}

const game = createGame(seed);
window.__game = game;

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  game.viewW = window.innerWidth;
  game.viewH = window.innerHeight;
  canvas.width = Math.round(game.viewW * ratio);
  canvas.height = Math.round(game.viewH * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
resize();
window.addEventListener('resize', resize);

function screenToWorld(mx, my) {
  const zoom = game.camera.zoom;
  const vw = game.viewW / zoom;
  const vh = game.viewH / zoom;
  const sx = clamp(game.camera.x - vw / 2, 0, WORLD_W - vw);
  const sy = clamp(game.camera.y - vh / 2, 0, WORLD_H - vh);
  return { x: sx + mx / zoom, y: sy + my / zoom };
}

function announce(message) {
  status.textContent = message;
}

// --- Bullets ---------------------------------------------------------------
function updateBullets(dt) {
  const p = game.player;
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += Math.cos(b.angle) * CFG.BULLET_SPEED * dt;
    b.y += Math.sin(b.angle) * CFG.BULLET_SPEED * dt;
    b.travelled += CFG.BULLET_SPEED * dt;
    let dead = b.travelled > CFG.BULLET_RANGE;
    if (!dead) {
      // Buildings stop bullets.
      const hitB = game.city.buildings.find(
        (r) => b.x > r.x && b.x < r.x + r.w && b.y > r.y && b.y < r.y + r.h,
      );
      if (hitB) dead = true;
    }
    if (!dead) {
      for (const car of game.cars) {
        if (car.wreck || car === p.inCar) continue;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const ca = Math.cos(-car.angle);
        const sa = Math.sin(-car.angle);
        const lx = dx * ca - dy * sa;
        const ly = dx * sa + dy * ca;
        if (Math.abs(lx) < 28 && Math.abs(ly) < 17) {
          const wasWreck = damageCar(car, CFG.BULLET_DAMAGE_CAR);
          game.particles.push({ kind: 'flash', x: b.x, y: b.y, t: 0.08 });
          if (wasWreck) {
            game.particles.push({ kind: 'explosion', x: car.x, y: car.y, t: 0.6 });
            game.audio.crash();
            if (car.driver === 'police') game.toast('Police car disabled!');
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const ped of game.peds) {
        if (ped.down) continue;
        if (Math.hypot(b.x - ped.x, b.y - ped.y) < 14) {
          ped.down = true;
          ped.downTimer = 5;
          if (game.player.elapsed - game.player.lastCrimeAt > 2) game.player.addWanted(1);
          scarePeds(game.peds, ped.x, ped.y, 200);
          dead = true;
          break;
        }
      }
    }
    if (dead) game.bullets.splice(i, 1);
  }
}

// --- Police ----------------------------------------------------------------
function managePolice(dt) {
  const p = game.player;
  const wanted = p.wanted;
  const active = game.cars.filter((c) => c.driver === 'police' && !c.wreck);
  const desired = Math.min(wanted, CFG.POLICE_MAX);
  if (active.length < desired) {
    const fresh = spawnPolice(game.city, game.rng, desired - active.length, p.x, p.y);
    game.cars.push(...fresh);
  }
  // With no heat, distant police drive off and despawn.
  if (wanted === 0) {
    for (let i = game.cars.length - 1; i >= 0; i -= 1) {
      const c = game.cars[i];
      if (c.driver === 'police' && Math.hypot(c.x - p.x, c.y - p.y) > 1000) {
        game.cars.splice(i, 1);
      }
    }
  }
  for (const car of game.cars) {
    if (car.ramCd > 0) car.ramCd -= dt;
  }
  updatePolice(game.cars, dt, game.city, p, (car) => {
    if (p.driving) {
      if ((car.ramCd || 0) <= 0) {
        car.ramCd = 0.9;
        damageCar(p.inCar, 12);
        game.audio.crash();
        game.particles.push({ kind: 'smoke', x: p.inCar.x, y: p.inCar.y, t: 0.7 });
      }
    }
  });
}

// --- Mission van -------------------------------------------------------------
function updateMissionVan(dt) {
  const van = game.missions.van;
  if (!van || van.wreck) return;
  const corners = van.corners;
  const target = corners[van.corner];
  const dx = target.x - van.x;
  const dy = target.y - van.y;
  if (Math.hypot(dx, dy) < 30) {
    van.corner = (van.corner + 1) % corners.length;
    return;
  }
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - van.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  van.angle += clamp(diff * 2, -1.6 * dt, 1.6 * dt);
  van.speed = Math.min(van.speed + van.spec.accel * dt, van.targetSpeed);
  van.x += Math.cos(van.angle) * van.speed * dt;
  van.y += Math.sin(van.angle) * van.speed * dt;
  resolveBuildingCollision(game.city, van, 20);
  // The player can ram the van to stop it.
  const p = game.player;
  if (p.driving && Math.hypot(p.inCar.x - van.x, p.inCar.y - van.y) < 42 && Math.abs(p.inCar.speed) > 120) {
    if ((van.ramCd || 0) <= 0) {
      van.ramCd = 0.6;
      damageCar(van, 22);
      damageCar(p.inCar, 8);
      game.audio.crash();
    }
  }
  if (van.ramCd > 0) van.ramCd -= dt;
}

// --- One fixed step ----------------------------------------------------------
function update(dt) {
  game.time += dt;
  game.clock += dt * 60;
  const p = game.player;

  if (game.state === 'title') {
    // Attract mode: the city lives behind the menu.
    updateTraffic(game.cars, dt, game.city, game.rng, null);
    updatePeds(game.peds, dt, game.rng);
    const t = game.time * 0.05;
    const cx = game.city.landmarks.plaza.x + Math.cos(t) * 260;
    const cy = game.city.landmarks.plaza.y + Math.sin(t) * 260;
    game.camera.follow(cx, cy, dt, game.viewW, game.viewH);
    game.audio.siren(dt, 0);
    return;
  }
  if (game.state !== 'playing') return;

  // Input: one-shot presses.
  const pressed = game.input.takePressed();
  if (pressed.has('KeyP') || pressed.has('Escape')) {
    pauseGame();
    return;
  }
  if (pressed.has('KeyM')) {
    game.audio.setMuted(!game.audio.muted);
    game.toast(game.audio.muted ? 'Sound muted' : 'Sound on');
  }
  if (pressed.has('KeyE')) {
    if (p.driving) p.exitCar(game);
    else {
      const car = p.nearestCar(game.cars);
      if (car) p.enterCar(car, game);
    }
  }
  if (game.input.mouse.clicked) {
    const w = screenToWorld(game.input.mouse.x, game.input.mouse.y);
    p.shoot(game, w.x, w.y);
  }

  p.update(dt, game);
  updateTraffic(game.cars, dt, game.city, game.rng, p.inCar);
  updatePeds(game.peds, dt, game.rng);
  updateBullets(dt);
  managePolice(dt);
  updateMissionVan(dt);
  game.missions.update(dt);

  // Traffic and pedestrian top-up.
  const traffic = game.cars.filter((c) => c.driver === 'traffic' && !c.wreck).length;
  if (traffic < CFG.TRAFFIC_COUNT) {
    const fresh = spawnTraffic(game.city, game.rng, 1, p.x, p.y, 700);
    game.cars.push(...fresh);
  }
  if (game.peds.length < CFG.PED_COUNT) {
    game.peds.push(...spawnPeds(game.rng, 2));
  }
  // Wrecks clear after a while.
  for (let i = game.cars.length - 1; i >= 0; i -= 1) {
    const c = game.cars[i];
    if (c.wreck) {
      c.wreckTimer -= dt;
      if (c.wreckTimer <= 0) game.cars.splice(i, 1);
    }
  }
  // Particles and skid marks age.
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    game.particles[i].t -= dt;
    if (game.particles[i].t <= 0) game.particles.splice(i, 1);
  }
  for (let i = game.skids.length - 1; i >= 0; i -= 1) {
    game.skids[i].t -= dt;
    if (game.skids[i].t <= 0) game.skids.splice(i, 1);
  }

  // Camera follows the player (or their car).
  game.camera.follow(p.x, p.y, dt, game.viewW, game.viewH);
  game.audio.siren(dt, p.wanted);

  // Autosave.
  game.saveTimer += dt;
  if (game.saveTimer > 20) {
    game.saveTimer = 0;
    game.saveGame();
  }

  // Busted / wasted.
  if (game.events.busted) {
    game.events.busted = false;
    endRun('busted');
  } else if (game.events.wasted) {
    game.events.wasted = false;
    endRun('wasted');
  }
  game.input.endFrame();
}

function endRun(kind) {
  const p = game.player;
  const lost = Math.min(p.cash, Math.max(200, Math.floor(p.cash * 0.1)));
  p.cash -= lost;
  game.audio.busted();
  if (game.missions.active) game.missions.fail(kind === 'busted' ? 'you were busted' : 'you were wasted');
  game.saveGame();
  game.state = kind;
  game.hud.showEnd(kind, lost);
  announce(kind === 'busted' ? 'Busted by the police.' : 'Wasted.');
}

function respawn() {
  const p = game.player;
  const g = game.city.landmarks.garage;
  if (p.inCar) {
    game.removeCar(p.inCar);
    p.inCar = null;
  }
  p.x = g.x;
  p.y = g.y + 60;
  p.angle = -Math.PI / 2;
  p.health = CFG.PLAYER_HEALTH;
  p.wanted = 0;
  p.bustTimer = 0;
  game.camera.snap(p.x, p.y, game.viewW, game.viewH);
  game.state = 'playing';
  game.hud.showOnly(null);
  game.saveGame();
  announce('Back on the streets.');
}

function startNewGame() {
  game.audio.unlock();
  game.audio.click();
  game.reset();
  game.missions.start(0);
  game.state = 'playing';
  game.hud.showOnly(null);
  announce('Playing. Follow Vera\u2019s orders — steal a car first.');
}

function continueGame() {
  const save = loadSave();
  if (!save) return;
  game.audio.unlock();
  game.audio.click();
  game.reset();
  game.player.cash = save.cash;
  game.player.x = save.x;
  game.player.y = save.y;
  game.player.health = save.health;
  game.camera.snap(save.x, save.y, game.viewW, game.viewH);
  if (save.missionDone) {
    game.missions.done = true;
    game.missions.active = false;
  } else {
    game.missions.start(save.missionIndex);
  }
  game.state = 'playing';
  game.hud.showOnly(null);
  announce('Welcome back to Solstice City.');
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  game.hud.showPause();
  game.saveGame();
  announce('Paused.');
}

function resumeGame() {
  if (game.state !== 'paused') return;
  game.audio.click();
  game.state = 'playing';
  game.hud.showOnly(null);
  announce('Playing.');
}

function quitToTitle() {
  game.audio.click();
  game.saveGame();
  game.state = 'title';
  game.hud.showStart(!!loadSave());
  announce('Solstice City. Press Enter to start.');
}

// --- Buttons -----------------------------------------------------------------
function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
bind('btn-new', startNewGame);
bind('btn-continue', continueGame);
bind('btn-resume', resumeGame);
bind('btn-restart-mission', () => {
  game.audio.click();
  game.missions.start(game.missions.index);
  game.state = 'playing';
  game.hud.showOnly(null);
});
bind('btn-restart-story', () => {
  game.audio.click();
  game.reset();
  game.missions.start(0);
  game.state = 'playing';
  game.hud.showOnly(null);
});
bind('btn-quit-title', quitToTitle);
bind('btn-end-continue', () => {
  game.audio.click();
  respawn();
});
bind('btn-story-continue', () => {
  game.audio.click();
  game.state = 'playing';
  game.hud.showOnly(null);
});
bind('btn-mute', () => {
  game.audio.unlock();
  game.audio.setMuted(!game.audio.muted);
  document.getElementById('btn-mute').textContent = game.audio.muted ? 'Sound: Off' : 'Sound: On';
});
document.getElementById('brief').addEventListener('click', () => {
  game.hud.el.brief.classList.add('hidden');
  game.hud.briefTimer = 0;
});

// Keyboard shortcuts on the menus.
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (game.state === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
    const save = loadSave();
    if (save) continueGame();
    else startNewGame();
  } else if ((game.state === 'busted' || game.state === 'wasted') && e.code === 'Enter') {
    respawn();
  } else if (game.state === 'paused' && (e.code === 'KeyP' || e.code === 'Escape' || e.code === 'Enter')) {
    resumeGame();
  } else if (game.state === 'story' && e.code === 'Enter') {
    game.state = 'playing';
    game.hud.showOnly(null);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') pauseGame();
});

// --- Render ------------------------------------------------------------------
function render() {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, game.viewW, game.viewH);
  renderWorld(ctx, game, game.camera, game.time, game.viewW, game.viewH);
  if (game.state !== 'title') game.hud.update(0);
}

// --- Shot mode -----------------------------------------------------------------
function runShot(name) {
  const scene = stageShot(name, game);
  for (let i = 0; i < scene.steps; i += 1) {
    scene.drive();
    update(STEP);
  }
  game.hud.update(0);
  render();
  render();
  window.__shotReady = true;
}

// --- Main loop -----------------------------------------------------------------
function runGame() {
  game.hud.showStart(!!loadSave());
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    render();
  }
  announce('Solstice City. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

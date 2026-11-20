// Solstice City v4 — boot and the main loop. A fixed-timestep simulation
// (1/60s steps, so the game runs in real time even at the 3-5 fps SwiftShader
// manages), a state machine (menu / playing / paused / busted / wasted /
// complete), and the ?shot= staging hook the screenshot tool uses: stage a
// scene, run exactly thirty fixed steps, freeze, and raise __shotReady.

import * as THREE from '../vendor/three.module.min.js';
import { STASH_COUNT, STASH_VALUE, STASH_RESPAWN, AUTOSAVE_SECONDS } from './config.js';
import { RNG } from './rng.js';
import { buildCity } from './city.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { createCar, spawnTraffic, updateCars, updateTraffic } from './vehicles.js';
import { createPlayer, updatePlayer, updateCamera, snapCamera, addCash, toggleHeadlights } from './player.js';
import { spawnPeds, spawnFleeing, updatePeds, prunePeds } from './pedestrians.js';
import { initPolice, updatePolice, createHeli } from './police.js';
import { createMissions, updateMissions } from './missions.js';
import { shootAt, updateBullets } from './combat.js';
import { initHUD, updateHUD } from './hud.js';
import { saveGame, loadSaveData, applySave } from './save.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const shotParam = params.get('shot');
const seed = parseInt(params.get('seed') || '0', 10) || (Math.floor(Math.random() * 90000) + 1000);

// --- renderer, scene, camera -------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game-canvas').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 6000);
camera.position.set(0, 400, 600);

// --- the game object (window.__game for the play-test) -----------------------
const g = {
  scene,
  camera,
  renderer: { renderer, scene, camera },
  city: null,
  player: null,
  cars: [],
  bullets: [],
  stashes: [],
  peds: { list: [] },
  missions: null,
  police: null,
  audio: new AudioEngine(),
  hud: null,
  input: null,
  rng: new RNG(seed),
  time: 0,
  state: 'menu',
  lastShot: null,
  saveTimer: 0,
  shotFrozen: false,
};
g.peds.spawnFleeing = (x, y) => spawnFleeing(g, x, y);
g.save = () => saveGame(g);
g.loadSaveData = () => loadSaveData();

// --- state machine ------------------------------------------------------------
function setState(s) {
  if (g.state === s) return;
  g.state = s;
  if (s === 'playing') g.hud.hideMenus();
  else if (s === 'paused') g.hud.showMenu('menu-pause');
  else if (s === 'menu') g.hud.showMenu('menu-start');
  else if (s === 'busted') {
    const el = document.getElementById('busted-info');
    if (el) el.textContent = `The SCPD caught you on foot. You lose 20% of your cash ($${g.player.cash}).`;
    g.hud.showMenu('menu-busted');
  } else if (s === 'wasted') {
    const el = document.getElementById('wasted-info');
    if (el) el.textContent = `You are wasted. The city takes 30% of your cash ($${g.player.cash}).`;
    g.hud.showMenu('menu-wasted');
  } else if (s === 'complete') {
    const el = document.getElementById('complete-stats');
    if (el) el.textContent = `Seven jobs done. $${g.player.totalEarned.toLocaleString('en-US')} earned — Legend of Solstice.`;
    g.hud.showMenu('menu-complete');
  }
  if (s === 'busted' || s === 'wasted') g.audio.setEngine(0, false);
}
g.setState = setState;

function clearWanted() {
  const p = g.player;
  p.wanted = 0;
  for (let i = g.cars.length - 1; i >= 0; i--) {
    if (g.cars[i].driver === 'police') {
      g.scene.remove(g.cars[i].group);
      g.cars.splice(i, 1);
    }
  }
  if (g.police.heli) {
    g.scene.remove(g.police.heli.group);
    g.police.heli = null;
  }
  g.police.roadblocksActive = false;
}

function resetPlayerToSpawn() {
  const p = g.player;
  if (p.inCar) {
    p.inCar.driver = null;
    p.inCar = null;
    p.driving = false;
  }
  p.x = g.city.spawn.x;
  p.y = g.city.spawn.y;
  p.heading = -Math.PI / 2;
  p.group.visible = true;
  p.group.position.set(p.x, 0, p.y);
  snapCamera(g);
}

function newGame() {
  clearWanted();
  const p = g.player;
  p.cash = 0;
  p.totalEarned = 0;
  p.health = 100;
  p.fare = null;
  p.headlightsOn = false;
  if (p.spot) p.spot.intensity = 0;
  if (p.pool) p.pool.visible = false;
  resetPlayerToSpawn();
  for (const s of g.stashes) {
    s.taken = false;
    s.timer = 0;
    s.mesh.visible = true;
  }
  for (const b of g.bullets) g.scene.remove(b.mesh);
  g.bullets.length = 0;
  g.time = 0;
  g.missions.startMission(0);
  g.audio.ensure();
  g.audio.setMuted(false);
  g.audio.startRadio();
  saveGame(g);
  setState('playing');
}
g.newGame = newGame;

function continueGame() {
  const data = loadSaveData();
  if (data) applySave(g, data);
  g.audio.ensure();
  g.audio.setMuted(false);
  g.audio.startRadio();
  setState('playing');
}
g.continueGame = continueGame;

function respawnAfterBusted() {
  const p = g.player;
  p.cash = Math.floor(p.cash * 0.8);
  p.health = 100;
  clearWanted();
  resetPlayerToSpawn();
  g.missions.resetCurrent();
  saveGame(g);
  setState('playing');
}
g.respawnAfterBusted = respawnAfterBusted;

function respawnAfterWasted() {
  const p = g.player;
  p.cash = Math.floor(p.cash * 0.7);
  p.health = 100;
  clearWanted();
  resetPlayerToSpawn();
  g.missions.resetCurrent();
  saveGame(g);
  setState('playing');
}
g.respawnAfterWasted = respawnAfterWasted;

// --- build the world ------------------------------------------------------------
g.city = buildCity(g, seed);
g.player = createPlayer(g);
g.missions = createMissions(g);
initPolice(g);
g.input = new Input(renderer.domElement);
initHUD(g); // HUD first: startMission below talks to it (dialogue, objective).
spawnTraffic(g, g.rng, 18);
spawnPeds(g, g.rng, 14);
g.missions.startMission(0);

// Cash stashes: eight green boxes tucked near the landmarks.
const STASH_SPOTS = [
  // Kept clear of every mission target radius (hotel 70, bank 70,
  // airport 80, casino 70, plaza 60, oldtown 60, port 70, garage 70,
  // boardwalk 80): a stash must never complete a mission stage by
  // accident when the player is teleported onto it.
  [912, -608], [-100, -500], [912, 608], [-1020, 960],
  [500, -560], [-700, -100], [1216, 912], [-300, 1900],
];
for (let i = 0; i < STASH_COUNT; i++) {
  const [x, y] = STASH_SPOTS[i % STASH_SPOTS.length];
  const mesh = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(5, 3.5, 5),
    new THREE.MeshBasicMaterial({ color: 0x2aff5e }),
  );
  box.position.y = 2;
  mesh.add(box);
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(5.4, 1, 5.4),
    new THREE.MeshBasicMaterial({ color: 0xffd21f }),
  );
  lid.position.y = 4.2;
  mesh.add(lid);
  mesh.position.set(x, 0, y);
  scene.add(mesh);
  g.stashes.push({ x, y, taken: false, timer: 0, mesh });
}

// --- per-step update ---------------------------------------------------------------
function updateStashes(dt) {
  const p = g.player;
  for (const s of g.stashes) {
    if (s.taken) {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.taken = false;
        s.mesh.visible = true;
      }
      continue;
    }
    if (Math.hypot(p.x - s.x, p.y - s.y) < 14) {
      s.taken = true;
      s.timer = STASH_RESPAWN;
      s.mesh.visible = false;
      addCash(g, STASH_VALUE);
    }
  }
}

function update(dt) {
  g.time += dt;
  // Clicks fire one shot each.
  if (g.input.clickQueue.length > 0) {
    const clicks = g.input.clickQueue.splice(0);
    for (const c of clicks) shootAt(g, c.x, c.y);
  }
  g.city.setLightPhase(g.time);
  updatePlayer(g, dt, g.input);
  updateTraffic(g, dt);
  updateCars(g, dt);
  updatePolice(g, dt);
  updatePeds(g, dt);
  prunePeds(g);
  updateMissions(g, dt);
  updateBullets(g, dt);
  updateStashes(dt);
  // Autosave.
  g.saveTimer += dt;
  if (g.saveTimer >= AUTOSAVE_SECONDS) {
    g.saveTimer = 0;
    saveGame(g);
  }
}

// --- shot staging (?shot=drive|chase|mission|foot) ---------------------------------
function stageShot(shot) {
  const p = g.player;
  g.hud.hideMenus();
  g.audio.setMuted(true);
  if (shot === 'drive') {
    // Cover: a sport car running west into the sunset.
    const car = createCar(g, { type: 'sport', x: 400, y: 0, heading: Math.PI, driver: 'player', color: 0xff7a1f });
    car.speed = 200;
    p.inCar = car;
    p.driving = true;
    p.group.visible = false;
    p.wanted = 0;
    p.x = car.x;
    p.y = car.y;
    p.heading = car.heading;
    toggleHeadlights(g); // Headlights on: a pool of light on the road ahead.
  } else if (shot === 'chase') {
    // Four stars: cruisers flanking, roadblocks ahead, HELI-1 overhead.
    const car = createCar(g, { type: 'sport', x: 0, y: 0, heading: Math.PI, driver: 'player', color: 0xff7a1f });
    car.speed = 180;
    p.inCar = car;
    p.driving = true;
    p.group.visible = false;
    p.wanted = 4;
    p.lastCrime = g.time;
    p.x = car.x;
    p.y = car.y;
    p.heading = car.heading;
    for (const [x, y] of [[-50, 28], [-75, -32], [-110, 15]]) {
      const cop = createCar(g, { type: 'police', x, y, heading: Math.PI, driver: 'police', color: 0x20242c });
      cop.speed = 200;
      cop.targetSpeed = cop.topSpeed;
    }
    for (const [x, y] of [[-380, 0], [-430, 0]]) {
      const rb = createCar(g, { type: 'police', x, y, heading: 0, driver: 'police', color: 0x20242c });
      rb.roadblock = true;
      rb.speed = 0;
    }
    g.police.roadblocksActive = true;
    g.police.heli = createHeli(g);
    g.police.heli.x = -140;
    g.police.heli.wy = 30;
    g.police.heli.h = 85;
    toggleHeadlights(g);
  } else if (shot === 'mission') {
    // On foot at the plaza, the beacon over the fountain.
    p.x = -80;
    p.y = -350;
    p.heading = Math.atan2(-456 - p.y, -152 - p.x);
    p.group.position.set(p.x, 0, p.y);
    g.missions.startMission(2);
  } else if (shot === 'foot') {
    // On foot on the boardwalk, palms and the bay.
    p.x = 0;
    p.y = 1880;
    p.heading = Math.PI / 2;
    p.group.position.set(p.x, 0, p.y);
  }
  if (shot !== 'mission') g.missions.startMission(0);
  setState('playing');
  snapCamera(g);
  // Run exactly thirty fixed steps so the scene settles, then freeze.
  for (let i = 0; i < 30; i++) update(STEP);
  updateCamera(g, 1);
  updateHUD(g, 1);
  g.shotFrozen = true;
}

// --- the frame loop ------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  // Pause toggle lives here, not in update(): update() only runs while the
  // game is playing, so a P press made while paused would never be read
  // and the game could never be resumed.
  if (g.input.wasPressed('KeyP')) {
    if (g.state === 'playing') setState('paused');
    else if (g.state === 'paused') setState('playing');
  }
  if (g.state === 'playing' && !g.shotFrozen) {
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 40 && g.state === 'playing') {
      update(STEP);
      acc -= STEP;
      steps += 1;
    }
    if (steps >= 40) acc = 0;
  } else if (g.state === 'menu') {
    // Slow orbit around downtown behind the title screen.
    const a = g.time * 0.05;
    camera.position.set(Math.cos(a) * 520, 380, Math.sin(a) * 520);
    camera.lookAt(0, 0, 0);
    g.time += dt * 0.2;
    g.city.setLightPhase(g.time);
  }
  if (!g.shotFrozen) {
    updateCamera(g, dt);
    updateHUD(g, dt);
  }
  g.input.endFrame();
  renderer.render(scene, camera);
}

// --- boot ------------------------------------------------------------------------------
window.__game = g;
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shotParam) {
  stageShot(shotParam);
  renderer.render(scene, camera);
  window.__shotReady = true;
} else {
  setState('menu');
}
requestAnimationFrame(frame);

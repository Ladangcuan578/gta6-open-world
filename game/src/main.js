// Solstice City — boot, the one loop, the chase camera, screens and the game API
// the screenshot scenes use. The game moves between title, playing, paused,
// busted/wasted and story-complete. ?shot=chase|drive|mission|foot (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import * as THREE from 'three';
import { WORLD, DISTRICT_STYLE, districtOf, blockCentre, roadLines } from './config.js';
import { createRandom } from './rng.js';
import { createCity } from './city.js';
import { createTraffic, createPlayerCar, makeCarModel } from './vehicles.js';
import { createPlayer } from './player.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions, MISSIONS } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, storeSave, clearSave } from './save.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const DISTRICT_NAMES = {
  downtown: 'Downtown', oldtown: 'Old Town', uptown: 'Uptown', portside: 'Portside',
  beach: 'Beachfront', park: 'Palm Park', plaza: 'Solstice Plaza', airfield: 'Solstice Airfield', midtown: 'Midtown',
};

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;
const qualityParam = params.get('quality');

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const save = loadSave();
const quality = qualityParam || save.quality || 'high';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = quality === 'high';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 40, 90);

const audio = createAudio();
const input = createInput(canvas);
const hud = createHud({ onSelectWeapon: (id) => world?.combat.select(id) });

let world = null;
let screen = 'title';
let wanted = 0;
let wantedDecay = 0;
let objective = '';
let marker = null;
let missionTarget = null;
let inTargetCar = false;
let simTime = 0;
let orbitYaw = 0;
let camPos = new THREE.Vector3(0, 40, 90);
let aimTarget = null;
let fps = 0;
let frames = 0;
let fpsTime = 0;
let playTimer = 0;
let winShown = false;

function announce(message) {
  statusEl.textContent = message;
}

function buildWorld(seedValue) {
  scene.clear();
  const rng = createRandom(seedValue);
  const city = createCity(scene, rng);
  const traffic = createTraffic(scene, rng, city.colliders, 26);
  const peds = createPedestrians(scene, rng, 42);
  const police = createPolice(scene, rng, city.colliders);
  const combat = createCombat(scene, rng, {
    onKill: () => missions?.markKill(),
    onPlayerDamage: (amount) => hurtPlayer(amount),
    onHeliHit: (amount) => {
      if (police.damageHeli(amount)) {
        hud.toast('Helicopter down — the air is clear.');
        setWanted(Math.max(0, wanted - 1));
      }
    },
    onShot: () => {
      audio.gunshot();
      setWanted(Math.max(wanted, 1));
      peds.fleeFrom(player.x, player.z);
    },
    onWeapon: () => {},
    onReload: () => {},
  });
  const player = createPlayer(scene);
  const missions = createMissions({
    toast: (msg) => hud.toast(msg),
    objective: (text) => { objective = text; },
    isDone: (id) => save.missionsDone.includes(id),
    addMoney: (n) => {
      player.money += n;
      save.money = player.money;
    },
    onStepStart: (step, def) => {
      marker = step.pos || null;
      if (step.kind === 'shootout') {
        const spots = [];
        for (let i = 0; i < step.count; i += 1) {
          const a = (i / step.count) * Math.PI * 2;
          // Enemies spawn on a ring around the objective — but a ring point
          // can land inside a building, hiding the enemy. Search nearby
          // radii and angles for the first spot clear of every collider.
          let spot = null;
          for (const r of [11, 14, 8, 17, 20, 5]) {
            for (const da of [0, 0.35, -0.35, 0.7, -0.7]) {
              const x = step.pos.x + Math.cos(a + da) * r;
              const z = step.pos.z + Math.sin(a + da) * r;
              const inside = city.colliders.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2);
              if (!inside) { spot = { x, z }; break; }
            }
            if (spot) break;
          }
          spots.push(spot || { x: step.pos.x + Math.cos(a) * 11, z: step.pos.z + Math.sin(a) * 11 });
        }
        combat.spawn(spots, 'smg');
      } else if (step.kind === 'tail') {
        const model = makeCarModel('sedan', 0x8a2ec2);
        const car = {
          model, variant: 'sedan',
          route: [{ x: 272, z: -34 }, { x: 272, z: -136 }, { x: 272, z: -204 }, { x: 272, z: -306 }],
          wp: 1, x: 272, z: -34, heading: Math.PI, speed: 0, targetSpeed: 13, length: model.length, parked: false,
        };
        model.group.position.set(car.x, 0, car.z);
        model.group.rotation.y = car.heading;
        scene.add(model.group);
        traffic.cars.push(car);
        missionTarget = { car, model, kind: 'tail', health: 100 };
      } else if (step.kind === 'ram') {
        const model = makeCarModel('sport', 0xc22e2e);
        const car = {
          model, variant: 'sport', route: [], wp: 0,
          x: player.x + 40, z: player.z + 10, heading: 0, speed: 0, targetSpeed: 17, length: model.length, parked: false,
        };
        // A fleeing car: give it a long route away from the player.
        const lines = roadLines();
        const startX = car.x;
        const startZ = car.z;
        car.route = [{ x: startX, z: startZ }, { x: startX > 0 ? -272 : 272, z: startZ }, { x: startX > 0 ? -272 : 272, z: startZ > 0 ? -272 : 272 }];
        car.wp = 1;
        model.group.position.set(car.x, 0, car.z);
        scene.add(model.group);
        traffic.cars.push(car);
        missionTarget = { car, model, kind: 'ram', health: 100, ramCooldown: 0 };
      } else if (step.kind === 'stealTarget') {
        const model = makeCarModel('sport', 0xffd21f);
        const car = {
          model, variant: 'sport', route: [], wp: 0,
          x: 68, z: 238, heading: 0, speed: 0, targetSpeed: 0, length: model.length, parked: true,
        };
        model.group.position.set(car.x, 0, car.z);
        model.group.rotation.y = car.heading;
        scene.add(model.group);
        traffic.cars.push(car);
        missionTarget = { car, model, kind: 'steal', health: 100 };
        hud.toast('The gold supercar is parked by the Casino. Take it.');
      } else if (step.kind === 'escape') {
        setWanted(step.minWanted);
      }
    },
    onMissionStart: () => {
      clearMissionEntities();
    },
    onMissionComplete: (def) => {
      save.missionsDone.push(def.id);
      storeSave(save);
      hud.banner('JOB DONE', `${def.title} — $${def.reward.toLocaleString('en-US')}`);
      audio.missionDone();
      announce(`Mission complete: ${def.title}.`);
      clearMissionEntities();
      if (def.id === 10 && !winShown) {
        winShown = true;
        window.setTimeout(() => {
          screen = 'win';
          hud.setScreen('screen-win');
        }, 2200);
      }
    },
    onMissionFail: (def) => {
      hud.banner('JOB FAILED', def.title, 'fail');
      audio.missionFail();
      clearMissionEntities();
    },
  });
  return { rng, city, traffic, peds, police, combat, player, missions, playerCar: null };
}

function clearMissionEntities() {
  if (!world) return;
  world.combat.clear();
  if (missionTarget) {
    const car = missionTarget.car;
    const index = world.traffic.cars.indexOf(car);
    if (index >= 0) world.traffic.cars.splice(index, 1);
    if (world.playerCar?.model === missionTarget.model) {
      // The player is driving the target car: leave it, it is theirs now.
    } else {
      scene.remove(missionTarget.model.group);
    }
    missionTarget = null;
  }
  inTargetCar = false;
  marker = null;
}

function setWanted(n) {
  wanted = Math.max(0, Math.min(5, n));
  if (wanted > save.bestWanted) {
    save.bestWanted = wanted;
    storeSave(save);
  }
}

function hurtPlayer(amount) {
  if (screen !== 'playing' || !world) return;
  world.player.health -= amount;
  if (world.player.health <= 0) endRun('wasted');
}

function endRun(kind) {
  if (screen !== 'playing') return;
  const lost = Math.floor(world.player.money * (kind === 'busted' ? 0.15 : 0.1));
  world.player.money -= lost;
  save.money = world.player.money;
  storeSave(save);
  world.missions.abort();
  world.police.clear();
  world.combat.clear();
  screen = 'over';
  document.getElementById('over-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  hud.setGameOver(kind === 'busted'
    ? `The SCPD took you in. You lost $${lost.toLocaleString('en-US')} in fines.`
    : `You flatlined on the streets of Solstice City. You lost $${lost.toLocaleString('en-US')} at the hospital.`);
  hud.setScreen('screen-over');
  announce(kind === 'busted' ? 'Busted by the police.' : 'Wasted.');
}

function respawn() {
  const plaza = blockCentre(4, 7);
  world.player.health = 100;
  world.player.money = Math.max(0, world.player.money);
  setWanted(0);
  world.player.setPose(plaza.x + 16, plaza.z, 0);
  world.player.inCar = false;
  world.player.model.group.visible = true;
  if (world.playerCar) {
    scene.remove(world.playerCar.model.group);
    world.playerCar = null;
  }
  screen = 'playing';
  hud.setScreen(null);
  hud.toast('Back on the streets. Stay out of trouble — or don\u2019t.');
}

function districtName(x, z) {
  const bx = Math.floor((x + WORLD.HALF - WORLD.ROAD) / (WORLD.BLOCK + WORLD.ROAD));
  const bz = Math.floor((z + WORLD.HALF - WORLD.ROAD) / (WORLD.BLOCK + WORLD.ROAD));
  if (bx < 0 || bx >= WORLD.GRID || bz < 0 || bz >= WORLD.GRID) {
    return z > WORLD.HALF - 30 ? 'Beachfront' : 'Solstice City';
  }
  return DISTRICT_NAMES[districtOf(bx, bz)] || 'Solstice City';
}

// ---- The game API the screenshot scenes use ---------------------------------
const game = {
  get car() {
    return world?.playerCar;
  },
  get player() {
    return world?.player;
  },
  reset(seedValue) {
    world = buildWorld(seedValue);
    wanted = 0;
    wantedDecay = 0;
    objective = '';
    marker = null;
    missionTarget = null;
    inTargetCar = false;
    simTime = 0;
    orbitYaw = 0;
    aimTarget = null;
    const plaza = blockCentre(4, 7);
    world.player.setPose(plaza.x + 16, plaza.z, 0);
    world.player.health = 100;
    world.player.money = save.money;
    world.player.inCar = false;
    screen = 'playing';
    hud.setScreen(null);
    return world;
  },
  placePlayerInCar(variant, color, x, z, heading) {
    const model = makeCarModel(variant, color);
    const car = createPlayerCar(scene, model);
    car.setPose(x, z, heading);
    car.lightsOn = true; // Dusk: the headlights pool light on the road ahead.
    if (world.playerCar) scene.remove(world.playerCar.model.group);
    world.playerCar = car;
    world.player.inCar = true;
    world.player.model.group.visible = false;
    world.player.x = x;
    world.player.z = z;
    world.player.heading = heading;
  },
  // Stage one cruiser on the player's tail, offset to the side so it reads
  // in frame without hiding the player's car (used by the chase shot).
  placeCruiserBehind() {
    if (!world.playerCar) return null;
    const car = world.playerCar;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const bx = car.x - fx * 5 + rx * 3.5;
    const bz = car.z - fz * 5 + rz * 3.5;
    return world.police.spawnAt(bx, bz, car.heading);
  },
  placePlayerOnFoot(x, z, heading) {    if (world.playerCar) {
      scene.remove(world.playerCar.model.group);
      world.playerCar = null;
    }
    world.player.inCar = false;
    world.player.model.group.visible = true;
    world.player.setPose(x, z, heading);
  },
  setWanted(n) {
    setWanted(n);
  },
  setObjective(text) {
    objective = text;
  },
  setRadio(i) {
    save.radio = i;
  },
  startMission(id) {
    return world.missions.start(id);
  },
  selectWeapon(id) {
    world.combat.select(id);
  },
  nearestEnemy() {
    let best = null;
    let bestD = Infinity;
    for (const e of world.combat.enemies) {
      if (e.health <= 0) continue;
      const d = Math.hypot(e.x - world.player.x, e.z - world.player.z);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  },
  // Nearest living enemy north of the player (used by the mission shot so
  // the player faces the city instead of the sea).
  nearestEnemyNorth() {
    let best = null;
    let bestD = Infinity;
    for (const e of world.combat.enemies) {
      if (e.health <= 0) continue;
      if (e.z >= world.player.z - 2) continue;
      const d = Math.hypot(e.x - world.player.x, e.z - world.player.z);
      if (d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  },
  aimAt(x, y, z) {
    aimTarget = new THREE.Vector3(x, y, z);
  },
  shoot() {
    if (!world || world.player.inCar) return;
    const origin = new THREE.Vector3(world.player.x, 1.5, world.player.z);
    const dir = aimTarget
      ? aimTarget.clone().sub(origin).normalize()
      : camera.getWorldDirection(new THREE.Vector3());
    world.combat.fire(origin, dir, world.police.heli);
  },
  step(dt, input) {
    simTime += dt;
    const { city, traffic, peds, police, combat, player, missions } = world;
    city.update(dt, simTime);
    traffic.update(dt, city.trafficLights);
    // Ram the lieutenant's car: a hard hit at speed stops it.
    if (missionTarget?.kind === 'ram' && world.playerCar) {
      const t = missionTarget;
      t.ramCooldown = Math.max(0, (t.ramCooldown || 0) - dt);
      const d = Math.hypot(t.car.x - world.playerCar.x, t.car.z - world.playerCar.z);
      if (d < 3.6 && Math.abs(world.playerCar.speed) > 12 && t.ramCooldown <= 0) {
        t.health -= 30;
        t.ramCooldown = 1;
        t.car.targetSpeed = Math.max(0, t.car.targetSpeed - 6);
        hud.toast('Ram him again — keep hitting his car!');
      }
      if (t.health <= 0) {
        t.car.parked = true;
        t.car.speed = 0;
        t.car.targetSpeed = 0;
      }
    }
    if (world.playerCar) {
      world.playerCar.update(dt, input, city.colliders, traffic, (speed) => {
        audio.crash();
        if (speed > 18) setWanted(Math.max(wanted, 1));
      });
      player.x = world.playerCar.x;
      player.z = world.playerCar.z;
      player.heading = world.playerCar.heading;
      player.speed = world.playerCar.speed;
      if (world.playerCar.damage >= 100) {
        hud.toast('Your car is wrecked!');
        audio.crash();
        hurtPlayer(15);
        const car = world.playerCar;
        scene.remove(car.model.group);
        world.playerCar = null;
        player.inCar = false;
        player.model.group.visible = true;
        player.setPose(car.x + 3, car.z, car.heading);
      }
    } else {
      player.update(dt, input, viewYaw(), city.colliders);
    }
    // Danger makes pedestrians flee: gunfire or a speeding car.
    const danger = (combatShotRecently || (world.playerCar && Math.abs(world.playerCar.speed) > 20))
      ? { x: player.x, z: player.z } : null;
    peds.update(dt, danger);
    // Hitting a pedestrian with the car: wanted, and they go down.
    if (world.playerCar && Math.abs(world.playerCar.speed) > 6) {
      const hit = peds.knockDown(world.playerCar.x, world.playerCar.z, 2.6);
      if (hit > 0) setWanted(Math.max(wanted, 1));
    }
    const busted = police.update(dt, simTime, {
      x: player.x, z: player.z, heading: player.heading, inCar: player.inCar, speed: player.speed,
    }, wanted);
    if (busted === 'busted') {
      if (screen === 'playing') endRun('busted');
      return;
    }
    combat.update(dt, { x: player.x, z: player.z }, police.heli);
    // Wanted decays when no police can see the player.
    let policeNear = false;
    for (const c of police.cruisers) {
      if (Math.hypot(c.x - player.x, c.z - player.z) < 70) policeNear = true;
    }
    if (wanted > 0 && !policeNear && (!police.heli || police.heliLock < 20)) {
      wantedDecay += dt;
      if (wantedDecay > 12) {
        wantedDecay = 0;
        setWanted(wanted - 1);
      }
    } else {
      wantedDecay = 0;
    }
    const targetInfo = missionTarget ? {
      dist: Math.hypot(missionTarget.car.x - player.x, missionTarget.car.z - player.z),
      health: missionTarget.health,
    } : null;
    missions.update(dt, {
      x: player.x, z: player.z,
      inCar: player.inCar,
      speed: player.speed || 0,
      wanted,
      target: targetInfo,
      inTargetCar,
    });
    // Camera.
    updateCamera(dt);
    // Audio follows the drive.
    audio.setEngine(world.playerCar ? Math.abs(world.playerCar.speed) / 46 : 0, !!world.playerCar);
    audio.setSiren(wanted > 0, wanted);
    // HUD.
    hud.update({
      x: player.x, z: player.z, heading: viewYaw(), district: districtName(player.x, player.z),
      wanted, health: player.health, money: player.money,
      weapon: combat.weapon, ammo: combat.ammo,
      speed: world.playerCar ? world.playerCar.speed : 0,
      inCar: player.inCar, radio: save.radio || 0,
      objective, hint: currentHint(), marker,
      traffic: traffic.cars, police: police.cruisers, heli: police.heli, heliLock: police.heliLock,
      time: simTime,
    });
  },
  render() {
    renderer.render(scene, camera);
  },
  getState() {
    if (!world) return { screen, ready: false };
    return {
      screen,
      ready: true,
      wanted,
      health: Math.round(world.player.health),
      money: Math.floor(world.player.money),
      inCar: world.player.inCar,
      speed: Math.round((world.playerCar ? world.playerCar.speed : world.player.speed) * 10) / 10,
      x: Math.round(world.player.x),
      z: Math.round(world.player.z),
      mission: world.missions.active ? world.missions.active.def.title : null,
      missionStep: world.missions.active ? world.missions.active.stepIndex : -1,
      missionsDone: save.missionsDone.length,
      enemies: world.combat.aliveCount(),
      enemyPos: world.combat.enemies.map((e) => ({ x: Math.round(e.x), z: Math.round(e.z), hp: e.health })),
      heading: Math.round(world.player.heading * 100) / 100,
      weapon: world.combat.weapon,
      heli: !!world.police.heli,
      heliLock: Math.round(world.police.heliLock),
      cruisers: world.police.cruisers.length,
      traffic: world.traffic.cars.length,
      fps,
    };
  },
};

let combatShotRecently = false;

function viewYaw() {
  const base = world.playerCar ? world.playerCar.heading : world.player.heading;
  return base + orbitYaw;
}

function updateCamera(dt) {
  const player = world.player;
  const inCar = !!world.playerCar;
  const speed01 = inCar ? Math.min(1, Math.abs(world.playerCar.speed) / 46) : 0;
  const dist = inCar ? 8.0 : 5.4;
  const height = inCar ? 2.4 : 2.0;
  const yaw = viewYaw();
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const tx = player.x;
  const tz = player.z;
  // On foot the camera sits over the right shoulder, so the player is left
  // of centre and whatever they aim at reads beside them, not behind them.
  const side = inCar ? 0 : 1.0;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const wantPos = new THREE.Vector3(tx - fx * dist + rx * side, height, tz - fz * dist + rz * side);
  camPos.lerp(wantPos, Math.min(1, dt * (inCar ? 6 : 9)));
  camera.position.copy(camPos);
  camera.lookAt(tx + fx * 4, inCar ? 1.6 : 1.3, tz + fz * 4);
  const wantFov = inCar ? 62 + speed01 * 8 : 60;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

function currentHint() {
  if (screen !== 'playing' || !world) return '';
  const player = world.player;
  if (!player.inCar) {
    const near = world.traffic.nearestStealable(player.x, player.z, 4.5);
    if (near) return 'Press E to steal this car';
    if (!world.missions.active) {
      const next = world.missions.nextMission();
      return next ? `Press N for the next job — ${next.title}` : 'All ten jobs done. Free roam!';
    }
    return '';
  }
  if (missionTarget?.kind === 'steal' && !inTargetCar) return 'That gold car by the Casino is the score';
  return '';
}

function enterOrExitCar() {
  const player = world.player;
  if (player.inCar) {
    const car = world.playerCar;
    const side = 2.6;
    const px = car.x + Math.cos(car.heading) * side;
    const pz = car.z - Math.sin(car.heading) * side;
    // The car stays behind as a parked car.
    world.traffic.cars.push({
      model: car.model, variant: 'sedan', route: [], wp: 0,
      x: car.x, z: car.z, heading: car.heading, speed: 0, targetSpeed: 0, length: car.model.length, parked: true,
    });
    world.playerCar = null;
    player.inCar = false;
    player.model.group.visible = true;
    player.setPose(px, pz, car.heading);
    inTargetCar = false;
    return;
  }
  const near = world.traffic.nearestStealable(player.x, player.z, 4.5);
  if (!near) return;
  const wasTarget = missionTarget && missionTarget.model === near.model;
  world.traffic.remove(near);
  const car = createPlayerCar(scene, near.model);
  car.setPose(near.x, near.z, near.heading);
  world.playerCar = car;
  player.inCar = true;
  player.model.group.visible = false;
  player.x = near.x;
  player.z = near.z;
  player.heading = near.heading;
  inTargetCar = !!wasTarget;
  // Stealing in view of the police is a crime.
  let seen = false;
  for (const c of world.police.cruisers) {
    if (Math.hypot(c.x - player.x, c.z - player.z) < 45) seen = true;
  }
  if (seen) {
    setWanted(Math.max(wanted, 1));
    hud.toast('The cops saw you steal that car!');
  } else {
    hud.toast(near.variant === 'taxi' ? 'Taxi taken. The meter is not running.' : 'Car stolen. Nice wheels.');
  }
  audio.unlock();
}

function startNextMission() {
  if (screen !== 'playing' || !world || world.missions.active) return;
  const next = world.missions.nextMission();
  if (next) {
    world.missions.start(next.id);
    audio.unlock();
  } else {
    hud.toast('All ten jobs are done. The city is yours.');
  }
}

// ---- Screens ----------------------------------------------------------------
function showTitle() {
  screen = 'title';
  hud.setTitleStats(save);
  hud.setScreen('screen-title');
  document.getElementById('quality').value = quality;
}

document.getElementById('btn-new').addEventListener('click', () => {
  clearSave();
  save.money = 250;
  save.missionsDone = [];
  save.bestWanted = 0;
  save.carsStolen = 0;
  save.kills = 0;
  save.playSeconds = 0;
  game.reset(seed);
  world.player.money = 250;
  screen = 'playing';
  hud.setScreen(null);
  hud.toast('New game. Mara Quinn is waiting — press N for your first job.');
  audio.unlock();
  audio.startRadio();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  game.reset(seed);
  world.player.money = save.money;
  screen = 'playing';
  hud.setScreen(null);
  audio.unlock();
  audio.startRadio();
});
document.getElementById('btn-resume').addEventListener('click', () => {
  screen = 'playing';
  hud.setScreen(null);
});
document.getElementById('btn-save-quit').addEventListener('click', () => {
  save.money = world.player.money;
  storeSave(save);
  showTitle();
});
document.getElementById('btn-respawn').addEventListener('click', () => respawn());
document.getElementById('btn-free').addEventListener('click', () => {
  screen = 'playing';
  hud.setScreen(null);
});
document.getElementById('quality').addEventListener('change', (event) => {
  save.quality = event.target.value;
  storeSave(save);
  window.location.reload();
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyN') startNextMission();
  if (event.code === 'KeyM') {
    save.radio = audio.setStation((save.radio || 0) + 1);
    hud.toast(`Radio: ${['SUNSET FM 88.1', 'BAY TALK 102.4', 'NEON NIGHTS 95.5'][save.radio % 3]}`);
  }
  if (event.code === 'KeyL' && world?.playerCar) {
    world.playerCar.lightsOn = !world.playerCar.lightsOn;
    hud.toast(world.playerCar.lightsOn ? 'Headlights on.' : 'Headlights off.');
  }
  if (event.code === 'KeyC') {
    orbitYaw = 0;
  }
  if (event.code === 'KeyQ') {
    hud.showWheel(true);
  }
  if (event.code === 'Digit1') world?.combat.select('fists');
  if (event.code === 'Digit2') world?.combat.select('pistol');
  if (event.code === 'Digit3') world?.combat.select('smg');
  if (event.code === 'Digit4') world?.combat.select('shotgun');
  if (event.code === 'KeyR') world?.combat.reload();
  if (event.code === 'KeyQ') audio.unlock();
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) audio.unlock();
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyQ') hud.showWheel(false);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- The interactive loop ----------------------------------------------------
let last = performance.now();
let accumulator = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const frameDt = Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  frames += 1;
  fpsTime += frameDt;
  if (fpsTime >= 1) {
    fps = Math.round(frames / fpsTime);
    frames = 0;
    fpsTime = 0;
  }
  if (screen === 'playing' && world) {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      // Pause, enter/exit, weapon wheel and shooting are edge events.
      if (input.wasPressed('pause')) {
        screen = 'paused';
        hud.setScreen('screen-pause');
        save.money = world.player.money;
        storeSave(save);
      }
      if (screen !== 'playing') break;
      if (input.wasPressed('enter')) enterOrExitCar();
      if (input.wasPressed('camera')) orbitYaw = 0;
      const drag = input.takeDrag();
      orbitYaw = Math.max(-1.2, Math.min(1.2, orbitYaw - drag.x * 0.004));
      // Shooting on foot: mouse click or Space.
      if (!world.player.inCar && (input.is('shoot') || input.is('brake'))) {
        aimTarget = null;
        game.shoot();
        combatShotRecently = true;
        window.setTimeout(() => { combatShotRecently = false; }, 1500);
      }
      game.step(STEP, input);
      input.endFrame();
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
    playTimer += frameDt;
    if (playTimer > 30) {
      playTimer = 0;
      save.playSeconds += 30;
      save.money = world.player.money;
      storeSave(save);
    }
  }
  if (world) game.render();
}

// ---- Boot --------------------------------------------------------------------
world = buildWorld(seed);
const plaza = blockCentre(4, 7);
world.player.setPose(plaza.x + 16, plaza.z, 0);
world.player.money = save.money;
window.__game = game;
window.__hud = hud;

if (shotName) {
  // Screenshot mode: stage the scene (it resets the world itself), paint it,
  // and signal readiness.
  const { stageShot } = await import('./shots.js');
  stageShot(shotName, game);
  window.__shotReady = true;
} else {
  showTitle();
  requestAnimationFrame(loop);
}

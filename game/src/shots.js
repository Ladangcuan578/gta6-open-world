// Solstice City v3 — screenshot staging. The shoot script loads the game
// with ?shot=drive|chase|mission|foot&seed=N. The game skips the title
// screen, stages one fixed scene from the seed, runs a fixed number of
// 1/60-second steps so the camera and the traffic settle, then sets
// window.__shotReady and FREEZES the simulation: the screenshot that
// follows is the same bytes every time it is taken.

import { MISSIONS } from './config.js';
import { RNG } from './random.js';
import { Car } from './cars.js';

function putPlayerInCar(game, car) {
  car.driver = 'player';
  car.mode = 'player';
  const p = game.player;
  p.driving = true;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  game.missions.onEvent('steal');
}

export function stageShot(game, params) {
  const shot = params.get('shot');
  if (!shot) return false;
  const seed = Number(params.get('seed') || '3');
  game.rng = new RNG(seed * 7919 + 13);
  game.shotMode = true;
  game.state = 'playing';
  game.hud.setScreen('game');
  game.missions.active = true;
  game.clockMinutes = 17 * 60 + 40;
  const p = game.player;

  if (shot === 'drive') {
    // The cover: a sport car running west into the sunset, traffic ahead.
    // The player takes the westbound lane; two cars run ahead of him in the
    // same lane (their legs are set straight west so they never turn off
    // the road mid-shot) and two come the other way in the eastbound lane.
    const car = new Car(game, 'sport', 1500, 1792, -Math.PI / 2, null);
    game.cars.push(car);
    putPlayerInCar(game, car);
    for (const [x, type] of [[1200, 'sedan'], [1000, 'taxi']]) {
      const t = new Car(game, type, x, 1792, -Math.PI / 2, 'traffic');
      t.speed = 110;
      t.legTo = { x: 200, y: 1792 };
      game.cars.push(t);
    }
    for (const [x, type] of [[700, 'coupe'], [500, 'truck']]) {
      const t = new Car(game, type, x, 1810, Math.PI / 2, 'traffic');
      t.speed = 110;
      t.legTo = { x: 2200, y: 1810 };
      game.cars.push(t);
    }
    game.renderer.camYaw = car.angle;
    game.input.keys.add('KeyW');
    game.shotFrames = 90;
  } else if (shot === 'chase') {
    // Four stars: cruisers behind, roadblocks ahead, the helicopter over.
    const car = new Car(game, 'sedan', 1200, 1000, -Math.PI / 2, null);
    game.cars.push(car);
    putPlayerInCar(game, car);
    p.addWanted(4);
    game.renderer.camYaw = car.angle;
    game.input.keys.add('KeyW');
    game.shotFrames = 90;
  } else if (shot === 'mission') {
    // On foot at the plaza: the marker over the fountain, Vera talking.
    p.x = 1200;
    p.y = 1100;
    p.angle = Math.PI;
    p.driving = false;
    p.inCar = null;
    game.missions.index = 2;
    game.missions.step = 0;
    game.missions.active = true;
    game.missions.timer = 0;
    game.hud.showDialogue(MISSIONS[2].intro, 'Vera Solano');
    game.peds.spawnPed(1150, 1160);
    game.peds.spawnPed(1260, 1140);
    game.renderer.camYaw = p.angle;
    game.shotFrames = 30;
  } else {
    // On foot on the boardwalk, facing north along it: planks underfoot,
    // palms and beachfront villas to the sides, the city ahead.
    p.x = 2260;
    p.y = 1500;
    p.angle = 0;
    p.driving = false;
    p.inCar = null;
    game.peds.spawnPed(2245, 1450);
    game.peds.spawnPed(2275, 1560);
    game.renderer.camYaw = p.angle;
    game.shotFrames = 30;
  }
  game.frame = 0;
  return true;
}

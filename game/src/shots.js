// Screenshot scenes behind ?shot=chase|drive|mission|foot. Each one plays the real
// rules forward from a fresh seeded world for a fixed number of steps, steered by
// a simple autopilot, so the frame is what a short game really looks like and the
// same seed always gives the same frame. The cover (1-chase) shows the most
// systems at once: a car, the police, the helicopter, the wanted level, the
// minimap and a mission objective.
import { roadLines } from './config.js';

const STEP = 1 / 60;

function scriptedInput() {
  const held = new Set();
  return {
    is: (a) => held.has(a),
    wasPressed: () => false,
    steer: () => (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0),
    throttle: () => (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0),
    takeDrag: () => ({ x: 0, y: 0 }),
    endFrame: () => {},
    inject: (a) => held.add(a),
    release: (a) => held.delete(a),
  };
}

function wrapAngle(a) {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Follow a route of road intersections: steer toward the next waypoint, easing
// off the throttle for sharp turns so the car does not clip building corners.
function followRoute(game, waypoints, input) {
  if (!game.car) return;
  let wp = game._shotWp || 0;
  const target = waypoints[wp];
  const dx = target.x - game.car.x;
  const dz = target.z - game.car.z;
  if (Math.hypot(dx, dz) < 14) {
    wp = (wp + 1) % waypoints.length;
    game._shotWp = wp;
    return;
  }
  const desired = Math.atan2(dx, dz);
  const diff = wrapAngle(desired - game.car.heading);
  input.release('left');
  input.release('right');
  input.release('up');
  if (diff > 0.06) input.inject('right');
  else if (diff < -0.06) input.inject('left');
  // Sharp turn ahead: coast so the turn stays on the road.
  if (Math.abs(diff) < 0.7) input.inject('up');
}

export function stageShot(name, game) {
  const input = scriptedInput();
  const lines = roadLines();
  const shots = {
    drive() {
      game.reset(7);
      game._shotWp = 0;
      game.placePlayerInCar('sport', 0xe8c33a, 200, lines[5], -Math.PI / 2);
      game.setObjective('Mission 2 — Hot Delivery: reach the Portside docks');
      game.setRadio(0);
      input.inject('up');
      for (let i = 0; i < 60 * 10; i += 1) {
        followRoute(game, [{ x: 200, z: 0 }, { x: -272, z: 0 }], input);
        game.step(STEP, input);
        if (!game.car) game.placePlayerInCar('sport', 0xe8c33a, game.player.x, game.player.z, game.player.heading);
      }
      return 'drive';
    },
    chase() {
      game.reset(7);
      game._shotWp = 0;
      game.placePlayerInCar('sport', 0xc22e2e, 250, lines[6], -Math.PI / 2);
      game._shotCruiser = game.placeCruiserBehind(); // A cruiser on the tail.
      game.setWanted(4);
      game.setObjective('Mission 8 — Bank Job: The Vault: escape to the airfield');
      input.inject('up');
      for (let i = 0; i < 60 * 11; i += 1) {
        followRoute(game, [
          { x: 250, z: 68 }, { x: -272, z: 68 }, { x: -272, z: 204 }, { x: 272, z: 204 },
        ], input);
        game.step(STEP, input);
        // Glue the staged cruiser to the tail, offset to the side so it
        // stays in frame without hiding the player's car.
        const tail = game._shotCruiser;
        if (tail && game.car) {
          const fx = Math.sin(game.car.heading);
          const fz = Math.cos(game.car.heading);
          const rx = Math.cos(game.car.heading);
          const rz = -Math.sin(game.car.heading);
          tail.x = game.car.x - fx * 5 + rx * 3.5;
          tail.z = game.car.z - fz * 5 + rz * 3.5;
          tail.heading = game.car.heading;
          tail.model.group.position.set(tail.x, 0, tail.z);
          tail.model.group.rotation.y = tail.heading;
        }
        if (!game.car) game.placePlayerInCar('sport', 0xc22e2e, game.player.x, game.player.z, game.player.heading);
      }
      return 'chase';
    },
    mission() {
      game.reset(7);
      // Mission 9, Ambush on the Boardwalk: on the sand south of the
      // Boardwalk, facing north toward the city — the skyline, the villas
      // and the Kings are all in frame. (Mission 6's warehouse sits at the
      // map's east edge, so facing it shows only empty ground.)
      game.placePlayerOnFoot(-34, 340, Math.PI);
      game.startMission(9);
      game.selectWeapon('smg');
      // Walk up to the Boardwalk and a few steps past it, so the Kings end
      // up close in frame, then hold position and shoot. Ten seconds keeps
      // the shootout in progress — and the player alive — for the frame.
      for (let i = 0; i < 60 * 10; i += 1) {
        if (i < 60 * 8) input.inject('up');
        else input.release('up');
        const target = game.nearestEnemyNorth() || game.nearestEnemy();
        if (target) game.aimAt(target.x, 1.4, target.z);
        game.step(STEP, input);
        // Stop shooting a second before the frame so the aimed-at King is
        // still standing in it.
        if (i % 30 === 0 && i < 60 * 9 && target) game.shoot();
      }
      return 'mission';
    },
    foot() {
      game.reset(7);
      // On the sand at the mouth of the gap between the beachfront villas,
      // facing north down the gap: the skyline and the sunset are in frame.
      game.placePlayerOnFoot(-34, 336, Math.PI);
      game.setObjective('Mission 1 — First Wheels: steal any car');
      for (let i = 0; i < 60 * 4; i += 1) {
        input.inject('up');
        game.step(STEP, input);
      }
      return 'foot';
    },
  };
  const fn = shots[name] || shots.drive;
  const staged = fn();
  game.render();
  game.render();
  return staged;
}

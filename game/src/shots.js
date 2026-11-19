// Solstice City — the screenshot scenes behind ?shot=drive|chase|mission|foot|start.
// Each one plays the real rules forward from a fresh world for a fixed number
// of steps, steered by a scripted driver, so the frame is what a short game
// really looks like and the same seed always gives the same frame. Driving
// shots use the chase cam, so anything that must read in the frame (police,
// skids, traffic) is staged AHEAD of the player, not behind them.
import { CFG } from './config.js';
import { makeRng } from './random.js';
import { makeCar } from './vehicles.js';

const STEPS = { drive: 50, chase: 34, mission: 12, foot: 12, start: 150 };

function hideBrief(game) {
  game.hud.el.brief.classList.add('hidden');
  game.hud.briefTimer = 0;
}

function putPlayerInCar(game, type, x, y, angle) {
  const car = makeCar(x, y, angle, type, type === 'sport' ? '#c23b2e' : '#2e6fc2', { driver: 'player' });
  car.speed = 200;
  game.cars.push(car);
  game.player.inCar = car;
  game.player.x = x;
  game.player.y = y;
  game.player.angle = angle;
  game.camera.snap(x, y, game.viewW, game.viewH);
  return car;
}

function holdKeys(game, codes) {
  for (const c of codes) game.input.keys.add(c);
}

function releaseKeys(game) {
  game.input.keys.clear();
}

// Set `game` to the named scene and return the number of fixed steps to run
// and the scripted input for them.
export function stageShot(name, game) {
  const seed = game.seed;
  const rng = makeRng(seed * 7 + 11);
  const lm = game.city.landmarks;
  releaseKeys(game);

  if (name === 'start') {
    game.state = 'title';
    game.hud.showStart(false);
    return { steps: STEPS.start, drive: () => {} };
  }

  if (name === 'drive') {
    game.state = 'playing';
    game.missions.start(0);
    game.missions.step = 1;
    hideBrief(game);
    const x = 4 * CFG.PITCH;
    const y = 6 * CFG.PITCH;
    putPlayerInCar(game, 'sport', x, y, 0);
    // A few traffic cars ahead on the same avenue, in the correct lane for
    // their direction (the traffic AI only turns at intersections). The
    // middle one is a yellow taxi, for a splash of sunset colour.
    const traffics = game.cars.filter((c) => c.driver === 'traffic').slice(0, 3);
    for (let i = 0; i < traffics.length; i += 1) {
      const t = traffics[i];
      t.axis = 'x';
      t.dir = i % 2 === 0 ? 1 : -1;
      t.x = x + 260 + i * 200;
      t.y = y + (t.dir > 0 ? 16 : -16);
      t.angle = t.dir > 0 ? 0 : Math.PI;
      t.speed = 120;
      if (i === 1) {
        t.type = 'taxi';
        t.spec = CFG.CAR_TYPES.taxi;
        t.color = '#e8b73a';
      }
    }
    game.hud.showOnly(null);
    return {
      steps: STEPS.drive,
      drive: () => holdKeys(game, ['KeyW']),
    };
  }

  if (name === 'chase') {
    game.state = 'playing';
    game.missions.start(2);
    hideBrief(game);
    const x = 5 * CFG.PITCH;
    const y = 4 * CFG.PITCH;
    const car = putPlayerInCar(game, 'sport', x, y, 0);
    // Four stars: the helicopter and a roadblock join the chase, and the
    // police panel fills with units — the densest frame in the game.
    game.player.addWanted(4);
    // Two police cars ahead, overtaking on either side (visible in the
    // chase cam), one behind for the minimap and the panel.
    for (let i = 0; i < 2; i += 1) {
      const pc = makeCar(x + 300 + i * 130, y + (i === 0 ? -34 : 34), 0, 'police', '#eef1f4', { driver: 'police' });
      pc.speed = 300;
      game.cars.push(pc);
    }
    const tail = makeCar(x - 220, y - 70, 0, 'police', '#eef1f4', { driver: 'police' });
    tail.speed = 260;
    game.cars.push(tail);
    // Skid marks ahead on the road, where the chase cam can see them.
    game.skids.push({ x: x + 200, y: y + 10, angle: 0.2, t: 5 });
    game.skids.push({ x: x + 260, y: y - 8, angle: -0.15, t: 5 });
    // A yellow taxi ahead for colour, same lane as the player.
    const taxi = makeCar(x + 480, y + 16, 0, 'taxi', '#e8b73a', { driver: 'traffic' });
    taxi.axis = 'x';
    taxi.dir = 1;
    taxi.speed = 120;
    game.cars.push(taxi);
    game.hud.showOnly(null);
    return {
      steps: STEPS.chase,
      drive: () => holdKeys(game, ['KeyW']),
    };
  }

  if (name === 'mission') {
    game.state = 'playing';
    game.missions.start(2);
    hideBrief(game);
    // Put the first drop at the intersection by Jacaranda Park (block 3,6):
    // the park sits south of the player, so the foreground is green trees
    // instead of a tall building's roof.
    const drop = game.missions.drops[0];
    drop.x = 3 * CFG.PITCH;
    drop.y = 6 * CFG.PITCH;
    // 80px east of the drop, on the same road: close enough to read the
    // scene, far enough (over 62px) that the drop is not collected during
    // the staged steps.
    game.player.x = drop.x + 80;
    game.player.y = drop.y;
    game.player.angle = Math.atan2(drop.y - game.player.y, drop.x - game.player.x);
    game.camera.snap(game.player.x, game.player.y, game.viewW, game.viewH);
    // A parked car and a few pedestrians nearby for life.
    const parked = makeCar(drop.x - 120, drop.y, 0, 'sedan', '#e8b73a', { driver: 'parked' });
    game.cars.push(parked);
    game.hud.showOnly(null);
    return { steps: STEPS.mission, drive: () => {} };
  }

  // 'foot' and anything else: on foot in the plaza, free roam.
  game.state = 'playing';
  game.missions.active = false;
  game.player.x = lm.plaza.x;
  game.player.y = lm.plaza.y + 40;
  game.player.angle = -Math.PI / 2;
  game.camera.snap(game.player.x, game.player.y, game.viewW, game.viewH);
  game.hud.showOnly(null);
  return { steps: STEPS.foot, drive: () => {} };
}

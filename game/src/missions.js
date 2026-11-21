// Ten story missions for Dante Vega, a driver-for-hire in Solstice City. He owes
// $50,000 to Eddie Voss of the Solstice Kings; the fixer Mara Quinn offers him
// jobs to pay it off, and the jobs escalate from a first stolen car to a final
// score at the airfield. All names, places and story beats are invented here.
import { blockCentre } from './config.js';

function at(bx, bz) {
  const c = blockCentre(bx, bz);
  return { x: c.x, z: c.z };
}

const GARAGE = at(4, 7);
const BANK = at(4, 4);
const SAFEHOUSE = at(1, 9);
const AIRFIELD = at(8, 0);
const WAREHOUSE = at(9, 4);
const MOTEL = at(6, 9);
const CASINO = at(5, 8);
const BOARDWALK = at(4, 9);

export const MISSIONS = [
  {
    id: 1, title: 'First Wheels', reward: 400,
    briefing: 'Mara Quinn needs a clean car. Steal any car off the street and bring it to her garage at Solstice Plaza. Press E beside a car to take it.',
    steps: [
      { kind: 'enterCar', label: 'Steal any car (press E beside one)' },
      { kind: 'deliver', pos: GARAGE, label: 'Deliver the car to Mara\u2019s garage' },
    ],
  },
  {
    id: 2, title: 'Hot Delivery', reward: 600,
    briefing: 'A package has to cross town before the Kings notice it is gone. Drive it from Uptown to the Portside docks in 150 seconds.',
    steps: [
      { kind: 'goto', pos: at(5, 1), label: 'Pick up the package in Uptown' },
      { kind: 'timed', pos: at(8, 3), seconds: 150, label: 'Deliver to the Portside docks — beat the clock' },
    ],
  },
  {
    id: 3, title: 'The Pickup', reward: 800,
    briefing: 'Mara\u2019s associate Juno is waiting in Old Town. Collect her and drive her to the Plaza meet. Keep it quiet: stay under 2 wanted stars.',
    steps: [
      { kind: 'goto', pos: at(1, 4), label: 'Reach Juno in Old Town' },
      { kind: 'pickup', pos: at(1, 4), seconds: 2, label: 'Wait for Juno to get in' },
      { kind: 'deliver', pos: at(5, 7), label: 'Drive Juno to the Plaza meet', maxWanted: 1 },
    ],
  },
  {
    id: 4, title: 'Bank Job: The Lobby', reward: 1500,
    briefing: 'The crew hits the Downtown bank. You are the wheelman: park outside, wait while they work, then lose the cops and reach the safehouse.',
    steps: [
      { kind: 'deliver', pos: BANK, label: 'Park outside the Downtown bank' },
      { kind: 'wait', pos: BANK, seconds: 20, label: 'Hold position while the crew works' },
      { kind: 'escape', pos: SAFEHOUSE, minWanted: 2, label: 'Escape to the Beachfront safehouse' },
    ],
  },
  {
    id: 5, title: 'Tail the Courier', reward: 900,
    briefing: 'A Kings courier is moving product from Portside to the airfield. Follow the marked car for 25 seconds. Too close and he spots you; too far and you lose him.',
    steps: [
      { kind: 'goto', pos: at(8, 3), label: 'Find the courier at Portside' },
      { kind: 'tail', seconds: 25, label: 'Follow the courier — not too close, not too far' },
    ],
  },
  {
    id: 6, title: 'Warehouse Raid', reward: 1800,
    briefing: 'The Kings stash their take in a Portside warehouse. Go in on foot, take out the five guards, grab the stash and get out. Press Q for the weapon wheel.',
    steps: [
      { kind: 'goto', pos: WAREHOUSE, label: 'Reach the Portside warehouse' },
      { kind: 'shootout', pos: WAREHOUSE, count: 5, label: 'Take out the guards (5 left)' },
      { kind: 'goto', pos: at(8, 5), label: 'Grab the stash and get out' },
    ],
  },
  {
    id: 7, title: 'The Informant', reward: 1400,
    briefing: 'Reyes, an informant, is hiding at the Beachfront motel and the SCPD want him. Pick him up and get him to the safehouse — the cops will be all over you.',
    steps: [
      { kind: 'goto', pos: MOTEL, label: 'Reach the Beachfront motel' },
      { kind: 'pickup', pos: MOTEL, seconds: 2, label: 'Wait for Reyes' },
      { kind: 'escape', pos: SAFEHOUSE, minWanted: 3, label: 'Lose the cops — reach the safehouse' },
    ],
  },
  {
    id: 8, title: 'Bank Job: The Vault', reward: 3000,
    briefing: 'The big one: the vault this time. Park at the bank, hold for 30 seconds, then run — expect four stars and the police helicopter.',
    steps: [
      { kind: 'deliver', pos: BANK, label: 'Park outside the Downtown bank' },
      { kind: 'wait', pos: BANK, seconds: 30, label: 'Hold while the vault is cracked' },
      { kind: 'escape', pos: AIRFIELD, minWanted: 4, label: 'Escape to the airfield — the heli is up' },
    ],
  },
  {
    id: 9, title: 'Ambush on the Boardwalk', reward: 2500,
    briefing: 'The Kings are moving on the Boardwalk. Take out six of them on foot, then run down Voss\u2019s lieutenant in his car and ram him to a stop.',
    steps: [
      { kind: 'goto', pos: BOARDWALK, label: 'Reach the Boardwalk' },
      { kind: 'shootout', pos: BOARDWALK, count: 6, label: 'Take out the Kings (6 left)' },
      { kind: 'ram', label: 'Ram the lieutenant\u2019s car to a stop' },
    ],
  },
  {
    id: 10, title: 'The Last Score', reward: 5000,
    briefing: 'One last job and the debt is gone: steal the gold supercar from the Casino, deliver it to the plane at the airfield, and outrun everything the city throws at you.',
    steps: [
      { kind: 'goto', pos: CASINO, label: 'Reach the Casino at Solstice Plaza' },
      { kind: 'stealTarget', pos: CASINO, label: 'Steal the gold supercar (press E)' },
      { kind: 'escape', pos: AIRFIELD, minWanted: 5, label: 'Deliver the supercar to the airfield plane' },
    ],
  },
];

export function createMissions(callbacks) {
  let active = null; // { def, stepIndex, timer, stepState }
  let doneCount = 0;

  function currentStep() {
    return active ? active.def.steps[active.stepIndex] : null;
  }
  function stepLabel(step, world) {
    if (step.kind === 'shootout') {
      const left = Math.max(0, step.count - (active?.stepState.kills || 0));
      return step.label.replace(/\(\d+ left\)/, `(${left} left)`);
    }
    return step.label;
  }
  function startStep(step) {
    active.timer = 0;
    active.stepState = {};
    callbacks.onStepStart?.(step, active.def);
    callbacks.objective?.(stepLabel(step, null));
  }

  return {
    get active() {
      return active;
    },
    get doneCount() {
      return doneCount;
    },
    nextMission() {
      return MISSIONS.find((m) => !callbacks.isDone(m.id)) || null;
    },
    start(missionId) {
      const def = MISSIONS.find((m) => m.id === missionId);
      if (!def) return false;
      active = { def, stepIndex: 0, timer: 0, stepState: {} };
      callbacks.toast?.(`${def.title} — ${def.briefing}`);
      callbacks.onMissionStart?.(def);
      startStep(def.steps[0]);
      return true;
    },
    abort() {
      if (!active) return;
      callbacks.toast?.(`${active.def.title} failed.`);
      callbacks.onMissionFail?.(active.def);
      active = null;
      callbacks.objective?.('');
    },
    markKill() {
      if (active) active.stepState.kills = (active.stepState.kills || 0) + 1;
    },
    update(dt, world) {
      if (!active) return null;
      const step = currentStep();
      active.timer += dt;
      const dist = (pos) => Math.hypot(world.x - pos.x, world.z - pos.z);
      let result = null;
      switch (step.kind) {
        case 'goto':
          if (dist(step.pos) < 8) result = 'done';
          break;
        case 'enterCar':
          if (world.inCar) result = 'done';
          break;
        case 'deliver':
          if (world.inCar && dist(step.pos) < 9) result = 'done';
          if (step.maxWanted !== undefined && world.wanted > step.maxWanted) result = 'fail';
          break;
        case 'timed': {
          const left = step.seconds - active.timer;
          callbacks.objective?.(`${step.label} — ${Math.max(0, Math.ceil(left))}s`);
          if (world.inCar && dist(step.pos) < 9) result = 'done';
          else if (left <= 0) result = 'fail';
          break;
        }
        case 'wait':
          if (dist(step.pos) > 14) result = 'fail';
          else if (active.timer >= step.seconds) result = 'done';
          else callbacks.objective?.(`${step.label} — ${Math.max(0, Math.ceil(step.seconds - active.timer))}s`);
          break;
        case 'pickup':
          if (dist(step.pos) > 14) result = 'fail';
          else if (active.timer >= step.seconds) result = 'done';
          break;
        case 'tail': {
          const t = world.target;
          if (!t) result = 'fail';
          else if (t.dist < 9) result = 'fail';
          else if (t.dist > 38) result = 'fail';
          else if (active.timer >= step.seconds) result = 'done';
          else callbacks.objective?.(`${step.label} — ${Math.max(0, Math.ceil(step.seconds - active.timer))}s`);
          break;
        }
        case 'shootout': {
          const left = step.count - (active.stepState.kills || 0);
          callbacks.objective?.(step.label.replace(/\(\d+ left\)/, `(${Math.max(0, left)} left)`));
          if (left <= 0) result = 'done';
          break;
        }
        case 'escape':
          if (dist(step.pos) < 9) result = 'done';
          break;
        case 'ram':
          if (world.target && world.target.health <= 0) result = 'done';
          break;
        case 'stealTarget':
          if (world.inTargetCar) result = 'done';
          break;
        default:
          break;
      }
      if (result === 'done') {
        active.stepIndex += 1;
        if (active.stepIndex >= active.def.steps.length) {
          const def = active.def;
          doneCount += 1;
          callbacks.addMoney?.(def.reward);
          callbacks.onMissionComplete?.(def);
          active = null;
          callbacks.objective?.('');
          return 'complete';
        }
        startStep(currentStep());
        return 'step';
      }
      if (result === 'fail') {
        const def = active.def;
        active = null;
        callbacks.onMissionFail?.(def);
        callbacks.objective?.('');
        return 'fail';
      }
      return null;
    },
  };
}

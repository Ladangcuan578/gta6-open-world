// Solstice City v4 — the story. Seven jobs for the fixer Vera Solano, each
// a small stage machine: reach the marker, do the thing, get paid. A beacon
// column marks the target on the street and on the minimap; a countdown
// runs on the timed legs, and running out of time sends the job back to
// its first stage.

import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS } from './config.js';
import { addCash } from './player.js';

function makeBeacon(g) {
  const group = new THREE.Group();
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(4.5, 4.5, 130, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  column.position.y = 65;
  group.add(column);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(8),
    new THREE.MeshBasicMaterial({ color: 0xffd21f }),
  );
  diamond.position.y = 42;
  group.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(8, 11, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.5;
  group.add(ring);
  group.visible = false;
  g.scene.add(group);
  return { group, diamond };
}

export function createMissions(g) {
  const beacon = makeBeacon(g);
  const missions = {
    index: 0,
    step: 0,
    active: true,
    timer: null,
    beacon,
    // The current stage definition, or null when the story is done.
    current() {
      if (this.index >= MISSIONS.length) return null;
      return MISSIONS[this.index];
    },
    stageDef() {
      const m = this.current();
      return m ? m.stages[this.step] : null;
    },
    // Where the beacon points right now (world coords), or null.
    target() {
      const stage = this.stageDef();
      if (!stage) return null;
      if (!stage.target) return null;
      const lm = g.city.landmarks[stage.target];
      return lm ? lm.arrival : null;
    },
    objectiveText() {
      const m = this.current();
      if (!m) return 'Story complete — Solstice City is yours.';
      const stage = this.stageDef();
      return `${m.name}: ${stage.objective}`;
    },
    // Called when the player steals a car.
    onSteal() {
      if (this.index === 0 && this.step === 0 && this.active) {
        this.step = 1;
        this.beginStage();
        g.hud.setDialogue('Vera', 'Itu dia. Sekarang bawa ke garasi gue, pelan-pelan.');
      }
    },
    beginStage() {
      const stage = this.stageDef();
      this.timer = stage && stage.timer ? stage.timer : null;
      g.hud.setObjective(this.objectiveText());
      g.hud.setStage(this.index + 1);
    },
    startMission(i) {
      this.index = i;
      this.step = 0;
      this.active = true;
      const m = this.current();
      if (m) {
        g.hud.setDialogue('Vera', m.intro);
        this.beginStage();
      }
    },
    completeMission() {
      const m = this.current();
      if (!m) return;
      addCash(g, m.pay);
      g.hud.setDialogue('Vera', m.done);
      this.index += 1;
      this.step = 0;
      if (this.index >= MISSIONS.length) {
        this.active = false;
        this.timer = null;
        this.beacon.group.visible = false;
        g.hud.setObjective('Story complete — Solstice City is yours.');
        g.setState('complete');
        return;
      }
      this.startMission(this.index);
    },
    failStage() {
      const m = this.current();
      g.hud.setDialogue('Vera', 'Kelamaan, Rico. Ulang dari awal — kali ini jangan santai.');
      g.hud.toast('Too slow — the job resets');
      this.step = 0;
      this.beginStage();
    },
    resetCurrent() {
      this.step = 0;
      this.beginStage();
    },
  };
  return missions;
}

export function updateMissions(g, dt) {
  const m = g.missions;
  if (!m.active) return;
  // Countdown on timed legs.
  if (m.timer !== null) {
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = null;
      m.failStage();
      return;
    }
  }
  const stage = m.stageDef();
  if (!stage) return;
  const at = g.player.driving && g.player.inCar ? g.player.inCar : g.player;
  if (stage.target) {
    const target = m.target();
    if (!target) return;
    const d = Math.hypot(at.x - target.x, at.y - target.y);
    // Beacon follows the target.
    m.beacon.group.visible = true;
    m.beacon.group.position.set(target.x, 0, target.y);
    m.beacon.diamond.rotation.y += dt * 2;
    m.beacon.diamond.position.y = 42 + Math.sin(g.time * 2) * 3;
    if (d < stage.radius) {
      m.step += 1;
      if (m.step >= m.current().stages.length) {
        m.completeMission();
      } else {
        m.beginStage();
      }
    }
  } else {
    // Stage 0 of First Wheels: the beacon hovers over the nearest car
    // worth stealing, so the player always knows where to look.
    let best = null;
    let bestD = Infinity;
    for (const car of g.cars) {
      if (car.driver !== 'traffic' || car.wreck) continue;
      const d = Math.hypot(car.x - at.x, car.y - at.y);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (best) {
      m.beacon.group.visible = true;
      m.beacon.group.position.set(best.x, 0, best.y);
      m.beacon.diamond.rotation.y += dt * 2;
      m.beacon.diamond.position.y = 42 + Math.sin(g.time * 2) * 3;
    } else {
      m.beacon.group.visible = false;
    }
  }
}

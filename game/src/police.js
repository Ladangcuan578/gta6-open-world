// Solstice City v3 — the police. Wanted levels field cruisers that chase and
// ram, roadblocks at four stars, and a helicopter at four stars and up. The
// helicopter is the part the last build got wrong: it always hovers AHEAD of
// the player, high up, with a narrow, faint searchlight cone, so the beam
// never cuts across the camera as a diagonal band.

import * as THREE from 'three';
import { POLICE_PER_WANTED, ROADBLOCK_WANTED, HELI_WANTED, PITCH, WORLD } from './config.js';
import { Car } from './cars.js';
import { toWorld } from './city.js';

const HELI_HEIGHT = 60;
const HELI_AHEAD = 300;

export class Police {
  constructor(game) {
    this.game = game;
    this.roadblocks = [];
    this.bustedTimer = 0;
    this.exitGrace = 0;
    this.heliAnnounced = false;
    this.heli = null;
    this._buildHeli();
  }

  _buildHeli() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e26 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(11, 3.4, 4.4), dark);
    body.castShadow = true;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(9, 1.4, 1.4), dark);
    tail.position.set(-9, 0.6, 0);
    const skidA = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 0.5), dark);
    skidA.position.set(0, -2.2, 1.8);
    const skidB = skidA.clone();
    skidB.position.z = -1.8;
    this.rotor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.25, 1.6), new THREE.MeshBasicMaterial({ color: 0x888888 }));
    this.rotor.position.y = 2.4;
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    beacon.position.set(0, -2.2, 0);
    g.add(body, tail, skidA, skidB, this.rotor, beacon);
    g.visible = false;
    this.game.renderer.scene.add(g);
    this.heliGroup = g;
    // The searchlight: a narrow cone, very faint, and a soft pool of light
    // on the ground. It is a separate object so it can aim at the player
    // while the helicopter itself stays level.
    const coneGeo = new THREE.ConeGeometry(30, HELI_HEIGHT, 20, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2c8, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(coneGeo, coneMat);
    this.beam.visible = false;
    this.game.renderer.scene.add(this.beam);
    const poolGeo = new THREE.CircleGeometry(30, 20);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.pool = new THREE.Mesh(poolGeo, poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.visible = false;
    this.game.renderer.scene.add(this.pool);
    this.heli = { x: 0, y: 0, z: HELI_HEIGHT, angle: 0 };
  }

  _spawnCruiser() {
    const p = this.game.player;
    const rng = this.game.rng;
    // On a road, a few blocks away, never inside a building.
    for (let tries = 0; tries < 12; tries += 1) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(240, 420);
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (x < 40 || x > WORLD - 40 || y < 40 || y > WORLD - 40) continue;
      const near = this.game.city.nearestRoadPoint(x, y);
      if (this.game.city.pointInBuilding(near.x, near.y, 6)) continue;
      const car = new Car(this.game, 'police', near.x, near.y, rng.range(0, Math.PI * 2), 'police');
      car.speed = 200;
      this.game.cars.push(car);
      return car;
    }
    return null;
  }

  _placeRoadblocks() {
    const p = this.game.player;
    const fx = Math.sin(p.angle), fy = -Math.cos(p.angle);
    // Two cruisers parked across the road ahead of the player, side by side,
    // noses turned to block the lane. They sit far enough ahead that a
    // driver at full speed sees them coming and has to deal with them,
    // instead of finding one parked on his own bumper.
    const spots = [
      { x: p.x + fx * 420 - fy * 14, y: p.y + fy * 420 + fx * 14 },
      { x: p.x + fx * 520 + fy * 14, y: p.y + fy * 520 - fx * 14 },
    ];
    for (const s of spots) {
      const near = this.game.city.nearestRoadPoint(s.x, s.y);
      const car = new Car(this.game, 'police', near.x, near.y, p.angle + Math.PI / 2, 'police');
      car.mode = 'roadblock';
      car.roadblock = true;
      car.speed = 0;
      car.targetSpeed = 0;
      this.game.cars.push(car);
      this.roadblocks.push(car);
    }
  }

  _clearRoadblocks() {
    for (const car of this.roadblocks) {
      const i = this.game.cars.indexOf(car);
      if (i !== -1) this.game.cars.splice(i, 1);
      car.destroy();
    }
    this.roadblocks = [];
  }

  update(dt) {
    const p = this.game.player;
    const wanted = p.wanted;
    // Keep the cruiser count at the level's strength.
    const want = POLICE_PER_WANTED(wanted);
    let have = this.game.cars.filter((c) => c.driver === 'police' && !c.roadblock && !c.wreck).length;
    while (have < want) {
      if (!this._spawnCruiser()) break;
      have += 1;
    }
    if (have > want) {
      const extra = this.game.cars.filter((c) => c.driver === 'police' && !c.roadblock && !c.wreck);
      extra.sort((a, b) => {
        const da = Math.hypot(a.x - p.x, a.y - p.y);
        const db = Math.hypot(b.x - p.x, b.y - p.y);
        return db - da;
      });
      for (let i = 0; i < have - want && i < extra.length; i += 1) {
        const car = extra[i];
        const idx = this.game.cars.indexOf(car);
        if (idx !== -1) this.game.cars.splice(idx, 1);
        car.destroy();
      }
    }
    // Roadblocks: exactly two while the level is four or higher.
    if (wanted >= ROADBLOCK_WANTED && this.roadblocks.length === 0) {
      this._placeRoadblocks();
      this.game.hud.toast('SCPD ROADBLOCK AHEAD — two units blocking the avenue');
    } else if (wanted < ROADBLOCK_WANTED && this.roadblocks.length > 0) {
      this._clearRoadblocks();
    }
    // Ramming: a cruiser that touches the player hurts. In a car the bodywork
    // takes most of it (a little reaches the driver); on foot it is all Rico.
    // The cooldown is long on purpose: a chase should wear the player down,
    // not flatten him in a few seconds.
    const px = p.driving && p.inCar ? p.inCar.x : p.x;
    const py = p.driving && p.inCar ? p.inCar.y : p.y;
    this._ramCooldown = Math.max(0, (this._ramCooldown || 0) - dt);
    for (const car of this.game.cars) {
      if (car.driver !== 'police' || car.wreck || car.roadblock) continue;
      const d = Math.hypot(car.x - px, car.y - py);
      if (d < 11 && this._ramCooldown <= 0) {
        this._ramCooldown = 1.0;
        if (p.driving && p.inCar) {
          p.inCar.damage(6);
          p.takeDamage(3);
        } else {
          p.takeDamage(6);
        }
        this.game.sound.crash();
        this.game.shake(0.35);
        if (p.driving && p.inCar) p.inCar.speed *= 0.55;
      }
    }
    // Busted: on foot, a cruiser sitting on top of the player for a while.
    // Two mercies: a grace period right after stepping out of a car (the
    // cops need a moment to notice you are on foot), and a long hold, so
    // a player who keeps moving can break away instead of being caught
    // the instant a cruiser pulls alongside.
    if (this.exitGrace > 0) {
      this.exitGrace -= dt;
      this.bustedTimer = 0;
    } else if (!p.driving && wanted > 0) {
      const near = this.game.cars.some((c) => c.driver === 'police' && !c.wreck
        && Math.hypot(c.x - p.x, c.y - p.y) < 48);
      this.bustedTimer = near ? this.bustedTimer + dt : 0;
      if (this.bustedTimer > 3) {
        this.bustedTimer = 0;
        this.game.busted();
      }
    } else {
      this.bustedTimer = 0;
    }
    this._updateHeli(dt);
  }

  _updateHeli(dt) {
    const p = this.game.player;
    const active = p.wanted >= HELI_WANTED && this.game.state === 'playing';
    this.heliGroup.visible = active;
    this.beam.visible = active;
    this.pool.visible = active;
    if (!active) {
      this.heliAnnounced = false;
      this._heliPlaced = false;
      return;
    }
    if (!this.heliAnnounced) {
      this.heliAnnounced = true;
      this.game.hud.toast('HELI-1 AIRBORNE — SCPD air support is over you');
    }
    // Hover ahead of the player, along the player's heading, over the road
    // itself: low enough and close enough to read in the frame, above the
    // streetlights and below the rooftops, with the searchlight falling on
    // the road in front of the car. (Higher and further away put it behind
    // the objective panel at the top of the screen.)
    const fx = Math.sin(p.angle), fy = -Math.cos(p.angle);
    const tx = p.x + fx * HELI_AHEAD;
    const ty = p.y + fy * HELI_AHEAD;
    if (!this._heliPlaced) {
      this._heliPlaced = true;
      this.heli.x = tx;
      this.heli.y = ty;
    }
    // Track fast: a helicopter that lags a hundred pixels behind a
    // speeding car ends up nearly overhead, out of the top of the frame.
    this.heli.x += (tx - this.heli.x) * Math.min(1, dt * 6);
    this.heli.y += (ty - this.heli.y) * Math.min(1, dt * 6);
    this.heli.angle += dt * 0.4;
    const pos = toWorld(this.heli.x, this.heli.y, HELI_HEIGHT);
    this.heliGroup.position.copy(pos);
    this.heliGroup.rotation.y = Math.PI / 2 - this.heli.angle;
    this.rotor.rotation.y += dt * 22;
    // The beam aims from the helicopter down to the ground just ahead of
    // the player: narrow, faint, and always in front of the camera.
    const ground = toWorld(p.x + fx * 60, p.y + fy * 60, 0.5);
    const mid = new THREE.Vector3().addVectors(pos, ground).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(ground, pos);
    const len = dir.length();
    this.beam.position.copy(mid);
    this.beam.scale.set(1, len / HELI_HEIGHT, 1);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    this.pool.position.set(ground.x, 0.55, ground.z);
    // The beacon pulses slowly.
    const pulse = 0.7 + Math.sin(this.game.time * 6) * 0.3;
    this.beam.material.opacity = 0.045 * pulse + 0.01;
  }
}

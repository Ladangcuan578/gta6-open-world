// Solstice City v3 — the game itself. The Game owns the world (city, cars,
// police, pedestrians, missions, the player, the sound) and the loop: a
// fixed 1/60 step in screenshot mode, real time with a clamp in play. It
// exposes window.__game, the contract the play-test and the screenshots
// drive: state, renderer, player, missions, city, cars, stashes, bullets.

import * as THREE from 'three';
import { WORLD, SPAWN, LIGHT_CYCLE } from './config.js';
import { RNG } from './random.js';
import { Renderer } from './render.js';
import { City, buildCityMeshes, toWorld } from './city.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { Police } from './police.js';
import { Pedestrians } from './peds.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { Car, spawnTrafficCar } from './cars.js';
import { saveGame, loadGame, Autosave } from './save.js';
import { stageShot } from './shots.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = 'menu';
    this.time = 0;
    this.clockMinutes = 17 * 60 + 20;
    this.frame = 0;
    this.rng = new RNG(4242);
    this.input = new Input();
    this.input.attach(canvas);
    this.sound = new SoundBank();
    this.renderer = new Renderer(this, canvas);
    this.city = new City(this);
    buildCityMeshes(this);
    this.player = new Player(this);
    this.player.reset(SPAWN.x, SPAWN.y);
    this.missions = new Missions(this);
    this.police = new Police(this);
    this.peds = new Pedestrians(this);
    this.hud = new HUD(this);
    this.autosave = new Autosave(this);
    this.cars = [];
    this.bullets = [];
    this.stashes = this.city.stashes;
    this.shotMode = false;
    this.shotFrames = 0;
    this.frozen = false;
    this._last = 0;
    this._acc = 0;
    this._spawnTraffic();
    this._bindMenu();
    this._bindKeys();
    window.addEventListener('resize', () => this.renderer.resize());
    window.__game = this;
  }

  _spawnTraffic() {
    for (let i = 0; i < 14; i += 1) {
      this.cars.push(spawnTrafficCar(this, this.rng));
    }
  }

  _clearCars() {
    for (const car of this.cars) car.destroy();
    this.cars = [];
  }

  _bindMenu() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { this.sound.unlock(); this.sound.click(); fn(); });
    };
    on('btn-new', () => this.newGame());
    on('btn-continue', () => this.continueGame());
    on('btn-resume', () => this.resume());
    on('btn-restart', () => this.newGame());
    on('btn-quit', () => this.toMenu());
    on('btn-busted-restart', () => this.newGame());
    on('btn-wasted-restart', () => this.newGame());
    on('btn-complete-restart', () => this.newGame());
    const cont = document.getElementById('btn-continue');
    if (cont) cont.classList.toggle('hidden', !loadGame());
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyP') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (e.code === 'KeyM') {
        this.sound.setMuted(!this.sound.muted);
      }
      if (e.code === 'KeyL') {
        this.renderer.headlightsOn = !this.renderer.headlightsOn;
        this.hud.toast(this.renderer.headlightsOn ? 'HEADLIGHTS ON' : 'HEADLIGHTS OFF');
      }
      if (e.code === 'KeyR') {
        this.sound.setTrack(this.sound.track + 1);
      }
      if (e.code === 'KeyE' && this.state === 'playing') {
        if (this.player.driving) this.player.exitCar();
        else this.player.tryEnterCar();
      }
      if (e.code === 'KeyT' && this.state === 'playing') {
        this.player.hailTaxi();
      }
    });
  }

  newGame() {
    this._clearCars();
    this._spawnTraffic();
    this.bullets = [];
    this.player.reset(SPAWN.x, SPAWN.y);
    this.missions.start();
    this.police.bustedTimer = 0;
    this.time = 0;
    this.clockMinutes = 17 * 60 + 20;
    this.state = 'playing';
    this.hud.setScreen('game');
    this.sound.unlock();
    this.save();
  }

  continueGame() {
    const data = loadGame();
    if (!data) return this.newGame();
    this._clearCars();
    this._spawnTraffic();
    this.bullets = [];
    this.player.reset(data.x || SPAWN.x, data.y || SPAWN.y);
    this.player.cash = data.cash || 0;
    this.player.totalEarned = data.totalEarned || 0;
    this.player.wanted = data.wanted || 0;
    this.player.health = data.health || 100;
    this.missions.index = Math.min(6, data.missionIndex || 0);
    this.missions.step = data.missionStep || 0;
    this.missions.active = true;
    this.missions.timer = 0;
    this.sound.setTrack(data.track || 0);
    this.state = 'playing';
    this.hud.setScreen('game');
    this.hud.showDialogue('Vera: Back on the street, Rico. The city did not wait for you.', 'Vera Solano');
    this.sound.unlock();
  }

  toMenu() {
    this.state = 'menu';
    this.hud.setScreen('start');
    const cont = document.getElementById('btn-continue');
    if (cont) cont.classList.toggle('hidden', !loadGame());
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.hud.setScreen('pause');
    this.save();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.setScreen('game');
  }

  busted() {
    if (this.state !== 'playing') return;
    this.player.cash = Math.max(0, this.player.cash - 200);
    this.player.wanted = 0;
    this.player.health = 100;
    if (this.player.driving) {
      this.player.inCar.driver = null;
      this.player.driving = false;
      this.player.inCar = null;
    }
    this.state = 'busted';
    this.hud.setScreen('busted');
    this.save();
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.player.cash = Math.max(0, this.player.cash - 200);
    this.player.wanted = 0;
    this.player.health = 100;
    if (this.player.driving) {
      this.player.inCar.driver = null;
      this.player.driving = false;
      this.player.inCar = null;
    }
    this.player.x = SPAWN.x;
    this.player.y = SPAWN.y;
    this.state = 'wasted';
    this.hud.setScreen('wasted');
    this.save();
  }

  storyComplete() {
    this.state = 'complete';
    this.hud.setScreen('complete');
    this.save();
  }

  save() {
    saveGame(this);
  }

  shake(amount) {
    this.renderer.shake(amount);
  }

  onCarWrecked(car) {
    this.renderer.addSmoke(car.x, car.y, 4);
    this.shake(0.6);
    this.sound.crash();
    if (this.player.driving && this.player.inCar === car) {
      this.player.driving = false;
      this.player.inCar = null;
      this.player.takeDamage(20);
    }
  }

  _aimFromMouse(mx, my) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((mx - rect.left) / rect.width) * 2 - 1;
    const ny = -((my - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, this.renderer.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) {
      return { x: hit.x + 1200, y: hit.z + 1200 };
    }
    // The cursor points at the sky (above the horizon): shoot toward the
    // ground in that direction instead of doing nothing.
    const d = ray.ray.direction;
    const hl = Math.hypot(d.x, d.z) || 1;
    return { x: this.player.x + (d.x / hl) * 300, y: this.player.y + (d.z / hl) * 300 };
  }

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead && this.city.pointInBuilding(b.x, b.y, 0)) dead = true;
      if (!dead && (b.x < 0 || b.x > WORLD || b.y < 0 || b.y > WORLD)) dead = true;
      if (!dead) {
        for (const ped of this.peds.peds) {
          if (ped.state === 'dead') continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 3) {
            this.peds.damage(ped, b.damage);
            this.player.addWanted(1);
            dead = true;
            break;
          }
        }
      }
      if (!dead) {
        for (const car of this.cars) {
          if (car.wreck) continue;
          if (car === this.player.inCar) continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < 4) {
            car.damage(15);
            if (car.driver === 'police') this.player.addWanted(1);
            dead = true;
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  _update(dt) {
    this.time += dt;
    this.clockMinutes += dt * 0.5;
    // Mouse aim: one click, one shot, toward the ground under the cursor.
    if (this.input.mouse.clicked && this.state === 'playing') {
      const aim = this._aimFromMouse(this.input.mouse.clicked.x, this.input.mouse.clicked.y);
      if (aim) this.player.shoot(aim.x, aim.y);
    }
    if (this.state === 'playing') {
      this.player.update(dt);
      for (const car of this.cars) car.update(dt);
      this.peds.update(dt);
      this.police.update(dt);
      this.missions.update(dt);
      this._updateBullets(dt);
      this.autosave.tick(dt);
    } else if (this.state === 'menu') {
      for (const car of this.cars) car.update(dt);
      this.peds.update(dt);
    }
    this.city.update(dt, this.time);
    this.hud.update(dt);
    const speedNorm = this.player.driving && this.player.inCar
      ? Math.min(1, Math.abs(this.player.inCar.speed) / 520) : 0;
    this.sound.engine(speedNorm, this.player.driving);
    this.input.endFrame();
  }

  loop = (t) => {
    requestAnimationFrame(this.loop);
    if (this.frozen) {
      this.renderer.render();
      return;
    }
    if (this.shotMode) {
      // Screenshot mode: fixed 1/60 steps, several per frame so the staged
      // scene settles in seconds even at SwiftShader frame rates. The step
      // count is fixed, so the shot is identical every time it is taken.
      for (let i = 0; i < 5 && this.frame < this.shotFrames; i += 1) {
        this._update(1 / 60);
        this.renderer.sync(1 / 60);
        this.frame += 1;
      }
      this.renderer.render();
      if (this.frame >= this.shotFrames) {
        this.frozen = true;
        window.__shotReady = true;
      }
      return;
    }
    // Play mode: the sim runs in fixed 1/60 steps fed by real time, so the
    // game plays at full speed even when the software renderer only manages
    // a few frames a second — one slow frame must not slow the whole city.
    // The backlog is capped so a hitch never spirals into a catch-up storm.
    const realDt = Math.min(0.5, Math.max(0, (t - this._last) / 1000 || 0.016));
    this._last = t;
    this._acc += realDt;
    const step = 1 / 60;
    let n = 0;
    while (this._acc >= step && n < 30) {
      this._update(step);
      this._acc -= step;
      n += 1;
    }
    if (n === 30) this._acc = 0;
    this.renderer.sync(realDt);
    if (this.state === 'menu') {
      // A slow orbit over the plaza behind the title screen.
      const a = this.time * 0.05;
      const cx = 1200 + Math.cos(a) * 620;
      const cz = 1200 + Math.sin(a) * 620;
      const pos = toWorld(cx, cz, 300);
      this.renderer.camera.position.set(pos.x, 300, pos.z);
      this.renderer.camera.lookAt(0, 20, 0);
    }
    this.renderer.render();
  };

  start() {
    requestAnimationFrame(this.loop);
  }
}

// Boot: build the world, stage a screenshot scene if asked, play.
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
const params = new URLSearchParams(window.location.search);
if (!stageShot(game, params)) {
  game.hud.setScreen('start');
}
game.start();

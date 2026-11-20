// Solstice City v3 — the renderer. A three.js scene at dusk: a gradient sky
// dome with a low sun, pink fog, long shadows, and a low chase camera that
// widens its field of view as the car goes faster. The logic world is flat
// 2D pixels; this module is the only place that knows about three.js, and it
// syncs every car, the player, the bullets, the marker and the smoke from
// the logic state once a frame.

import * as THREE from 'three';
import { WORLD, HALF, DUSK } from './config.js';
import { toWorld } from './city.js';
import { makeCanvas, canvasTexture } from './geom.js';
import { WHEEL_R } from './cars.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w;
}`;
const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 lowColor;
uniform vec3 sunDir;
void main() {
  float h = clamp(vDir.y, -0.08, 1.0);
  vec3 col = h > 0.45 ? mix(midColor, topColor, (h - 0.45) / 0.55)
    : mix(lowColor, midColor, h / 0.45);
  float sun = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 18.0);
  col += vec3(1.0, 0.55, 0.25) * sun * 0.9;
  float band = pow(max(dot(normalize(vDir), normalize(sunDir)), 0.0), 3.0);
  col += vec3(0.9, 0.35, 0.45) * band * 0.25;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Renderer {
  constructor(game, canvas) {
    this.game = game;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(DUSK.fog, DUSK.fogNear, DUSK.fogFar);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4200);
    this.camYaw = 0;
    this.camDist = 15;
    this.camHeight = 6.5;
    this.shakeT = 0;
    this.headlightsOn = true;
    this._buildSky();
    this._buildLights();
    this._buildPlayerMesh();
    this._buildBullets();
    this._buildMarker();
    this._buildSmoke();
    this._buildHeadlight();
    this._initWheels();
    this.resize();
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(3200, 24, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        topColor: { value: new THREE.Color(DUSK.skyTop) },
        midColor: { value: new THREE.Color(DUSK.skyMid) },
        lowColor: { value: new THREE.Color(DUSK.skyLow) },
        sunDir: { value: new THREE.Vector3(-0.85, 0.12, 0.25).normalize() },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
    // The sun itself: a soft glowing sprite low in the west.
    const { canvas, ctx } = makeCanvas(256, 256);
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
    grad.addColorStop(0.25, 'rgba(255, 190, 110, 0.85)');
    grad.addColorStop(0.6, 'rgba(255, 120, 60, 0.25)');
    grad.addColorStop(1, 'rgba(255, 120, 60, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = canvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sprite.position.set(-2600, 300, 600);
    sprite.scale.set(900, 900, 1);
    this.scene.add(sprite);
  }

  _buildLights() {
    const amb = new THREE.AmbientLight(DUSK.ambient, DUSK.ambientIntensity);
    this.scene.add(amb);
    const hemi = new THREE.HemisphereLight(DUSK.hemiSky, DUSK.hemiGround, DUSK.hemiIntensity);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(DUSK.sunColor, DUSK.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -280; sc.right = 280; sc.top = 280; sc.bottom = -280;
    sc.near = 50; sc.far = 1600;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  _buildPlayerMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2.4, 0.9),
      new THREE.MeshLambertMaterial({ color: 0xc84a4a }),
    );
    body.position.y = 1.9;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xc89a6a }),
    );
    head.position.y = 3.6;
    head.castShadow = true;
    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x2a2a3a }),
    );
    legs.position.y = 0.6;
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.25, 0.25),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    );
    gun.position.set(0.9, 2.2, 0.5);
    g.add(body, head, legs, gun);
    this.playerMesh = g;
    this.scene.add(g);
  }

  _buildBullets() {
    const geo = new THREE.BoxGeometry(1.6, 0.35, 0.35);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    this.bulletMesh = new THREE.InstancedMesh(geo, mat, 64);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.count = 0;
    this.scene.add(this.bulletMesh);
    this._dummy = new THREE.Object3D();
  }

  _buildMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 46, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23c, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 23;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(8, 12, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffd23c, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(5),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    gem.position.y = 16;
    g.add(beam, ring, gem);
    this.marker = g;
    this.markerRing = ring;
    this.markerGem = gem;
    this.scene.add(g);
  }

  _buildSmoke() {
    const { canvas, ctx } = makeCanvas(64, 64);
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(80, 80, 80, 0.8)');
    grad.addColorStop(1, 'rgba(80, 80, 80, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = canvasTexture(canvas);
    this.smokePool = [];
    for (let i = 0; i < 12; i += 1) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
      s.scale.set(1, 1, 1);
      this.scene.add(s);
      this.smokePool.push({ sprite: s, life: 0, x: 0, y: 0, z: 0 });
    }
  }

  addSmoke(x, y, n = 3) {
    let placed = 0;
    for (const s of this.smokePool) {
      if (placed >= n) break;
      if (s.life <= 0) {
        const w = toWorld(x, y, 3);
        s.x = w.x; s.y = 3; s.z = w.z;
        s.life = 1.6;
        placed += 1;
      }
    }
  }

  _buildHeadlight() {
    this.headlight = new THREE.SpotLight(0xffe8b0, 90, 110, 0.55, 0.6, 1.2);
    this.headlight.visible = false;
    this.scene.add(this.headlight);
    this.scene.add(this.headlight.target);
    const poolGeo = new THREE.CircleGeometry(13, 20);
    const poolMat = new THREE.MeshBasicMaterial({
      color: 0xffe8b0, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.headPool = new THREE.Mesh(poolGeo, poolMat);
    this.headPool.rotation.x = -Math.PI / 2;
    this.headPool.visible = false;
    this.scene.add(this.headPool);
  }

  _initWheels() {
    const geo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.65, 10);
    const mat = new THREE.MeshLambertMaterial({ color: 0x14141a });
    this.wheelMesh = new THREE.InstancedMesh(geo, mat, 128);
    this.wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheelMesh.count = 0;
    this.scene.add(this.wheelMesh);
    this._wheelCursor = 0;
    this._wheelFree = [];
  }

  registerWheels(n) {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      out.push(this._wheelFree.length ? this._wheelFree.pop() : this._wheelCursor++);
    }
    return out;
  }

  freeWheels(indices) {
    for (const i of indices) this._wheelFree.push(i);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  shake(amount) {
    this.shakeT = Math.max(this.shakeT, amount);
  }

  _syncCars() {
    const d = this._dummy;
    let wi = 0;
    for (const car of this.game.cars) {
      const pos = toWorld(car.x, car.y, 0);
      car.group.position.copy(pos);
      car.group.rotation.y = Math.PI / 2 - car.angle;
      // Wheels: front axle steers, all four roll with the car.
      const axle = car.spec.len * 0.32;
      const offsets = [
        { x: axle, z: 1.18, steer: true },
        { x: axle, z: -1.18, steer: true },
        { x: -axle, z: 1.18, steer: false },
        { x: -axle, z: -1.18, steer: false },
      ];
      car.wheels.forEach((idx, k) => {
        const off = offsets[k];
        const steer = off.steer ? car.steer : 0;
        // Spin about the cylinder's own axle first, then lay it down on
        // its side, then steer, then the car's yaw: the axle ends up
        // lateral, and the wheel never tumbles as it rolls.
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - car.angle, 0))
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, steer, 0)))
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)))
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, car.spin, 0)));
        const local = new THREE.Vector3(off.x, 0.85, off.z).applyQuaternion(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - car.angle, 0)),
        );
        d.position.set(pos.x + local.x, 0.85, pos.z + local.z);
        d.quaternion.copy(q);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.wheelMesh.setMatrixAt(idx, d.matrix);
        wi = Math.max(wi, idx + 1);
      });
    }
    this.wheelMesh.count = wi;
    this.wheelMesh.instanceMatrix.needsUpdate = true;
  }

  _syncPlayer() {
    const p = this.game.player;
    const pos = toWorld(p.x, p.y, 0);
    this.playerMesh.visible = !p.driving && !p.riding && this.game.state !== 'menu';
    if (!this.playerMesh.visible) return;
    this.playerMesh.position.copy(pos);
    this.playerMesh.rotation.y = Math.PI / 2 - p.angle;
    const bob = p.speed > 1 ? Math.abs(Math.sin(this.game.time * 9)) * 0.25 : 0;
    this.playerMesh.position.y = bob;
  }

  _syncBullets() {
    const d = this._dummy;
    this.game.bullets.forEach((b, i) => {
      const pos = toWorld(b.x, b.y, 1.2);
      d.position.copy(pos);
      d.rotation.set(0, Math.atan2(-b.vy, b.vx), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.bulletMesh.setMatrixAt(i, d.matrix);
    });
    this.bulletMesh.count = this.game.bullets.length;
    this.bulletMesh.instanceMatrix.needsUpdate = true;
  }

  _syncMarker() {
    const target = this.game.missions.markerTarget();
    this.marker.visible = !!target && this.game.state === 'playing';
    if (!target) return;
    const pos = toWorld(target.x, target.y, 0);
    this.marker.position.set(pos.x, 0, pos.z);
    const pulse = 1 + Math.sin(this.game.time * 4) * 0.15;
    this.markerRing.scale.set(pulse, pulse, 1);
    this.markerGem.position.y = 14 + Math.sin(this.game.time * 2.5) * 2;
    this.markerGem.rotation.y += 0.02;
  }

  _syncSmoke(dt) {
    for (const s of this.smokePool) {
      if (s.life <= 0) {
        s.sprite.material.opacity = 0;
        continue;
      }
      s.life -= dt;
      s.y += dt * 6;
      const k = Math.max(0, s.life / 1.6);
      s.sprite.position.set(s.x, s.y, s.z);
      s.sprite.scale.set(8 + (1 - k) * 14, 8 + (1 - k) * 14, 1);
      s.sprite.material.opacity = k * 0.55;
    }
  }

  _syncHeadlight() {
    const p = this.game.player;
    const on = p.driving && p.inCar && this.headlightsOn && this.game.state === 'playing';
    this.headlight.visible = on;
    this.headPool.visible = on;
    if (!on) return;
    const car = p.inCar;
    const pos = toWorld(car.x, car.y, 2.2);
    const fx = Math.sin(car.angle), fy = -Math.cos(car.angle);
    this.headlight.position.set(pos.x + fx * 2, 2.2, pos.z - fy * 2);
    this.headlight.target.position.set(pos.x + fx * 42, 0.5, pos.z - fy * 42);
    const pool = toWorld(car.x + fx * 16, car.y + fy * 16, 0.1);
    this.headPool.position.set(pool.x, 0.1, pool.z);
  }

  _updateCamera(dt) {
    const p = this.game.player;
    const driving = p.driving && p.inCar;
    const speedNorm = driving ? Math.min(1, Math.abs(p.inCar.speed) / 520) : 0;
    // The camera yaw eases toward the heading so turns feel like a chase.
    let want = p.angle;
    let diff = want - this.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camYaw += diff * Math.min(1, dt * (driving ? 3.2 : 5));
    const dist = driving ? 15.5 : 11;
    const height = driving ? 6.8 : 5.2;
    const fx = Math.sin(this.camYaw), fy = -Math.cos(this.camYaw);
    const pos = toWorld(p.x, p.y, 0);
    // Logic +y is three +z, so the camera sits behind the player along the
    // same forward vector in both axes: minus on x AND on z. (The z term
    // used to be plus, which put the camera in front of the player whenever
    // he faced north or south — the westbound shots hid it because fy is
    // zero when heading west.)
    const cx = pos.x - fx * dist;
    const cz = pos.z - fy * dist;
    this.camera.position.set(cx, height, cz);
    this.camera.lookAt(pos.x + fx * 10, 2.2, pos.z + fy * 10);
    const wantFov = driving ? 62 + speedNorm * 13 : 60;
    if (Math.abs(this.camera.fov - wantFov) > 0.05) {
      this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
    // Shake only ever comes from explosions: a decaying wobble.
    this.shakeT = Math.max(0, this.shakeT - dt * 1.4);
    if (this.shakeT > 0.001) {
      const t = this.game.time;
      const amp = this.shakeT * 0.9;
      this.camera.position.x += Math.sin(t * 47) * amp;
      this.camera.position.y += Math.sin(t * 39 + 2) * amp;
    }
    // The sun and its shadows follow the player so the light never runs out.
    this.sun.position.set(pos.x - 520, 360, pos.z + 180);
    this.sun.target.position.set(pos.x, 0, pos.z);
    this.sky.position.set(pos.x, 0, pos.z);
  }

  sync(dt) {
    this._syncCars();
    this._syncPlayer();
    this._syncBullets();
    this._syncMarker();
    this._syncSmoke(dt);
    this._syncHeadlight();
    this._updateCamera(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

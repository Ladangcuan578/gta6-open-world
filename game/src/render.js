// Solstice City — the 3D renderer: three.js draws the same 2D simulation
// (city grid, cars, peds, player) as a sun-soaked 3D city. The camera is a
// high-angle 3/4 view, fixed north-up, following the player and pulling back
// at speed. The ground is one textured plane from the prerendered city
// canvas; buildings, trees, cars and people are 3D objects with shadows.
import * as THREE from 'three';
import { CFG, PAL } from './config.js';
import { WORLD_W, WORLD_H } from './city.js';

// The camera focus point: where the view is centred. main.js and shots.js
// move it; the renderer turns it into a 3D camera every frame.
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.snapped = true; // the 3D camera jumps to the focus on the next render
  }

  snap(x, y) {
    this.x = x;
    this.y = y;
    this.zoom = 1;
    this.snapped = true;
  }

  follow(x, y, dt) {
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (x - this.x) * k;
    this.y += (y - this.y) * k;
    this.zoom = 1;
  }
}

// A deterministic 0..1 hash from a pair of coordinates, for building heights.
function hash2(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// One facade texture: a base wall colour with a grid of windows.
function makeFacadeTexture(base, frame) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = base;
  c.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 10 + col * 30;
      const y = 10 + row * 30;
      c.fillStyle = frame;
      c.fillRect(x - 2, y - 2, 22, 24);
      c.fillStyle = (col + row) % 3 === 0 ? '#2b3a4a' : '#33475c';
      c.fillRect(x, y, 18, 20);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(x, y, 18, 4);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Scale a box's UVs so the facade texture tiles once per ~44 world units.
function scaleBoxUVs(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  const faceDims = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f += 1) {
    const [fw, fh] = faceDims[f];
    const ru = Math.max(1, Math.round(fw / tile));
    const rv = Math.max(1, Math.round(fh / tile));
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    }
  }
}

const CAR_DIMS = {
  sedan: [48, 11, 24],
  sport: [50, 9, 23],
  truck: [54, 13, 26],
  van: [54, 14, 26],
  police: [48, 11, 24],
};

export class Renderer3D {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    // Adaptive quality: software renderers (SwiftShader, llvmpipe) get a
    // lighter setup so the game stays playable; real GPUs get the full look.
    let software = false;
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      const ext = probe && probe.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(probe.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      software = /swiftshader|llvmpipe|software/i.test(name);
    } catch {
      software = false;
    }
    this.software = software;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !software });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, software ? 1 : 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cc3e5);
    this.scene.fog = new THREE.Fog(0x9cc3e5, 1700, 3800);

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 7000);
    this.camera.position.set(0, 620, 440);
    this.camera.lookAt(0, 0, 0);

    // Sun and sky.
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x9a8a6a, 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffe3b3, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(software ? 1024 : 2048, software ? 1024 : 2048);
    this.sun.shadow.camera.left = -520;
    this.sun.shadow.camera.right = 520;
    this.sun.shadow.camera.top = 520;
    this.sun.shadow.camera.bottom = -520;
    this.sun.shadow.camera.near = 50;
    this.sun.shadow.camera.far = 2200;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // The ground: the prerendered city canvas as one big texture, downscaled
    // to 2048x2304 (plenty at this camera height) with modest anisotropy —
    // a full-size 12 MP texture with 16x anisotropy is what software
    // renderers choke on.
    const groundSrc = document.createElement('canvas');
    groundSrc.width = 2048;
    groundSrc.height = 2304;
    groundSrc.getContext('2d').drawImage(game.cityCanvas, 0, 0, 2048, 2304);
    const groundTex = new THREE.CanvasTexture(groundSrc);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      new THREE.MeshLambertMaterial({ map: groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Building materials: three shared facades, roofs from the palette.
    this.facades = [
      new THREE.MeshLambertMaterial({ map: makeFacadeTexture('#e8dcc8', '#c9b48a') }),
      new THREE.MeshLambertMaterial({ map: makeFacadeTexture('#dccbb2', '#b59a72') }),
      new THREE.MeshLambertMaterial({ map: makeFacadeTexture('#cfd6c2', '#a8b394') }),
    ];
    this.roofs = PAL.roofs.map(
      (color) => new THREE.MeshLambertMaterial({ color }),
    );
    this.bottomMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    this.buildBuildings(game.city);

    this.buildTrees(game.city);
    this.buildStreetlights();

    // Shared car parts.
    this.wheelGeo = new THREE.CylinderGeometry(4.5, 4.5, 3.5, 10);
    this.wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });
    this.glassMat = new THREE.MeshLambertMaterial({ color: 0x20242a });
    this.bodyMats = new Map();
    this.redLightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1e });
    this.blueLightMat = new THREE.MeshBasicMaterial({ color: 0x2a6bff });
    this.carGroups = new Map();

    // Shared person parts.
    this.legMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
    this.shirtMats = new Map();
    this.skinMats = new Map();
    this.pedGroups = new Map();
    this.playerGroup = this.buildPerson(PAL.playerJacket, '#e8b98a', true);
    this.scene.add(this.playerGroup);

    // The ring under the player so they are always findable.
    this.playerRing = new THREE.Mesh(
      new THREE.RingGeometry(28, 34, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.playerRing.rotation.x = -Math.PI / 2;
    this.playerRing.position.y = 1.2;
    this.scene.add(this.playerRing);

    // Mission marker: a pulsing ring and a bouncing arrow.
    this.markerRing = new THREE.Mesh(
      new THREE.TorusGeometry(46, 3.5, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    this.markerRing.rotation.x = -Math.PI / 2;
    this.markerRing.position.y = 2;
    this.scene.add(this.markerRing);
    this.markerArrow = new THREE.Mesh(
      new THREE.ConeGeometry(11, 24, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23e }),
    );
    this.markerArrow.rotation.x = Math.PI;
    this.scene.add(this.markerArrow);

    // Coin pools: cash drops, stashes, the fare marker.
    this.coinGeo = new THREE.CylinderGeometry(13, 13, 3, 16);
    this.coinMat = new THREE.MeshLambertMaterial({ color: 0xe8b73a, emissive: 0x7a5a00 });
    this.coinRingGeo = new THREE.RingGeometry(16, 20, 24);
    this.coinRingMat = new THREE.MeshBasicMaterial({ color: 0xe8b73a, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    this.coins = [];
    for (let i = 0; i < 24; i += 1) {
      const coin = new THREE.Mesh(this.coinGeo, this.coinMat);
      const ring = new THREE.Mesh(this.coinRingGeo, this.coinRingMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 1.4;
      coin.visible = false;
      ring.visible = false;
      this.scene.add(coin);
      this.scene.add(ring);
      this.coins.push({ coin, ring, used: false });
    }

    // Bullet pool.
    this.bulletGeo = new THREE.BoxGeometry(10, 2.5, 2.5);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    this.bullets = [];
    for (let i = 0; i < 16; i += 1) {
      const b = new THREE.Mesh(this.bulletGeo, this.bulletMat);
      b.visible = false;
      this.scene.add(b);
      this.bullets.push(b);
    }

    // Particle pool (flash / smoke / explosion).
    this.particleGeo = new THREE.SphereGeometry(1, 10, 8);
    this.particleMats = {
      flash: new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true }),
      smoke: new THREE.MeshLambertMaterial({ color: 0x8a8a8a, transparent: true }),
      explosion: new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true }),
    };
    this.particles = [];
    for (let i = 0; i < 24; i += 1) {
      const m = new THREE.Mesh(this.particleGeo, this.particleMats.smoke);
      m.visible = false;
      this.scene.add(m);
      this.particles.push(m);
    }

    // Skid-mark pool.
    this.skidGeo = new THREE.BoxGeometry(26, 1, 6);
    this.skidMat = new THREE.MeshLambertMaterial({ color: 0x141414, transparent: true, opacity: 0.5 });
    this.skids = [];
    for (let i = 0; i < 48; i += 1) {
      const s = new THREE.Mesh(this.skidGeo, this.skidMat);
      s.visible = false;
      this.scene.add(s);
      this.skids.push(s);
    }

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._v = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
  }

  bodyMat(color) {
    if (!this.bodyMats.has(color)) {
      this.bodyMats.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return this.bodyMats.get(color);
  }

  shirtMat(color) {
    if (!this.shirtMats.has(color)) {
      this.shirtMats.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return this.shirtMats.get(color);
  }

  skinMat(color) {
    if (!this.skinMats.has(color)) {
      this.skinMats.set(color, new THREE.MeshLambertMaterial({ color }));
    }
    return this.skinMats.get(color);
  }

  buildBuildings(city) {
    for (const b of city.buildings) {
      const h = b.kind === 'hangar' ? 22 : 26 + hash2(b.x, b.y) * 66;
      const geo = new THREE.BoxGeometry(b.w, h, b.h);
      scaleBoxUVs(geo, b.w, h, b.h, 44);
      const facade = this.facades[Math.floor(hash2(b.x + 3, b.y + 7) * this.facades.length)];
      const roof = this.roofs[Math.floor(hash2(b.x + 11, b.y + 5) * this.roofs.length)];
      const mesh = new THREE.Mesh(geo, [facade, facade, roof, this.bottomMat, facade, facade]);
      mesh.position.set(b.x + b.w / 2, h / 2, b.y + b.h / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  buildTrees(city) {
    const count = city.trees.length;
    const trunkGeo = new THREE.CylinderGeometry(2.5, 3.5, 14, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const canopyGeo = new THREE.IcosahedronGeometry(11, 1);
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const greens = [new THREE.Color(0x4a8a3a), new THREE.Color(0x5a9a44), new THREE.Color(0x3f7a34)];
    for (let i = 0; i < count; i += 1) {
      const t = city.trees[i];
      const sc = 0.8 + hash2(t.x, t.y) * 0.5;
      pos.set(t.x, 7, t.y);
      s.set(1, 1, 1);
      m.compose(pos, q, s);
      trunks.setMatrixAt(i, m);
      pos.set(t.x, 20 * sc, t.y);
      s.set(sc, sc, sc);
      m.compose(pos, q, s);
      canopies.setMatrixAt(i, m);
      canopies.setColorAt(i, greens[Math.floor(hash2(t.x + 1, t.y + 2) * greens.length)]);
    }
    trunks.castShadow = true;
    canopies.castShadow = true;
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    this.scene.add(trunks);
    this.scene.add(canopies);
  }

  buildStreetlights() {
    // A lamp at every other intersection.
    const spots = [];
    for (let gx = 0; gx <= CFG.GRID; gx += 2) {
      for (let gy = 0; gy <= CFG.GRID; gy += 2) {
        spots.push({ x: gx * CFG.PITCH + 30, y: gy * CFG.PITCH + 30 });
      }
    }
    const count = spots.length;
    const poleGeo = new THREE.CylinderGeometry(1.4, 1.8, 30, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const lampGeo = new THREE.SphereGeometry(3.2, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      pos.set(spots[i].x, 15, spots[i].y);
      m.compose(pos, q, s);
      poles.setMatrixAt(i, m);
      pos.set(spots[i].x, 31, spots[i].y);
      m.compose(pos, q, s);
      lamps.setMatrixAt(i, m);
    }
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    poles.castShadow = true;
    this.scene.add(poles);
    this.scene.add(lamps);
  }

  buildCar(car) {
    const [len, hgt, wid] = CAR_DIMS[car.type] || CAR_DIMS.sedan;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(len, hgt, wid),
      this.bodyMat(car.color),
    );
    body.position.y = 4 + hgt / 2;
    body.castShadow = true;
    g.add(body);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.48, 8, wid * 0.82),
      this.glassMat,
    );
    cabin.position.set(-len * 0.04, 4 + hgt + 4, 0);
    cabin.castShadow = true;
    g.add(cabin);
    const wy = 4.5;
    const wx = len / 2 - 9;
    const wz = wid / 2 - 1;
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const wheel = new THREE.Mesh(this.wheelGeo, this.wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx * wx, wy, sz * wz);
      wheel.castShadow = true;
      g.add(wheel);
    }
    if (car.type === 'police') {
      const barGeo = new THREE.BoxGeometry(7, 2.5, 5);
      const red = new THREE.Mesh(barGeo, this.redLightMat);
      red.position.set(-len * 0.04 - 4, 4 + hgt + 9.5, 0);
      const blue = new THREE.Mesh(barGeo, this.blueLightMat);
      blue.position.set(-len * 0.04 + 4, 4 + hgt + 9.5, 0);
      g.add(red);
      g.add(blue);
      g.userData.red = red;
      g.userData.blue = blue;
    }
    return g;
  }

  buildPerson(shirt, skin, withCap) {
    const g = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(4.5, 9, 4.5);
    const legL = new THREE.Mesh(legGeo, this.legMat);
    legL.position.set(-2.8, 4.5, 0);
    const legR = new THREE.Mesh(legGeo, this.legMat);
    legR.position.set(2.8, 4.5, 0);
    legL.castShadow = true;
    legR.castShadow = true;
    g.add(legL);
    g.add(legR);
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(12, 14, 7),
      this.shirtMat(shirt),
    );
    torso.position.y = 16;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 10),
      this.skinMat(skin),
    );
    head.position.y = 27.5;
    head.castShadow = true;
    g.add(head);
    if (withCap) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(9, 3, 9),
        new THREE.MeshLambertMaterial({ color: 0x1d2126 }),
      );
      cap.position.y = 31.5;
      g.add(cap);
    }
    g.userData.legL = legL;
    g.userData.legR = legR;
    return g;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Screen pixels (CSS pixels, origin top-left) to a point on the ground.
  worldFromScreen(mx, my) {
    const w = this.game.viewW;
    const h = this.game.viewH;
    this._ndc.set((mx / w) * 2 - 1, -(my / h) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this._v);
    if (hit) return { x: hit.x, y: hit.z };
    return { x: this.game.player.x, y: this.game.player.y };
  }

  render(game, time) {
    const p = game.player;
    const focus = game.camera;

    // Camera: high-angle 3/4 view, north-up, pulling back at speed.
    // Steep enough (about 60 degrees) that a tall building south of the
    // player rarely blocks the view, close enough that the player and their
    // car read clearly on screen.
    const speedRatio = p.driving ? Math.min(Math.abs(p.inCar.speed) / 570, 1) : 0;
    const H = 460 + speedRatio * 110;
    const D = 250 + speedRatio * 70;
    if (focus.snapped) {
      // A snap (new game, respawn, a staged screenshot) jumps the camera
      // straight to the focus instead of lerping there over many frames.
      this.camera.position.set(focus.x, H, focus.y + D);
      focus.snapped = false;
    } else {
      const kx = 1 - Math.pow(0.0001, 1 / 60);
      const wantX = focus.x;
      const wantZ = focus.y + D;
      this.camera.position.x += (wantX - this.camera.position.x) * kx;
      this.camera.position.y += (H - this.camera.position.y) * kx;
      this.camera.position.z += (wantZ - this.camera.position.z) * kx;
    }
    this.camera.lookAt(focus.x, 0, focus.y);

    // The sun follows the player so shadows stay crisp nearby.
    this.sun.position.set(focus.x + 380, 680, focus.y + 260);
    this.sun.target.position.set(focus.x, 0, focus.y);
    this.sun.target.updateMatrixWorld();

    // Cars: create, move, and remove groups to match the simulation.
    const seenCars = new Set();
    for (const car of game.cars) {
      seenCars.add(car.id);
      let g = this.carGroups.get(car.id);
      if (!g) {
        g = this.buildCar(car);
        this.carGroups.set(car.id, g);
        this.scene.add(g);
      }
      g.position.set(car.x, 0, car.y);
      g.rotation.y = -car.angle;
      g.rotation.z = car.wreck ? 0.1 : 0;
      if (car.type === 'police' && g.userData.red) {
        const phase = (time * 2.4 + car.sirenPhase) % 2;
        g.userData.red.visible = phase < 1;
        g.userData.blue.visible = phase >= 1;
      }
      // A wrecked car smokes: the particles come from the sim's list.
      // Deterministic (time + car id), never Math.random, so re-shoots
      // are byte-identical.
      if (car.smoke > 0 && (Math.floor(time * 8) + car.id) % 3 === 0) {
        game.particles.push({ kind: 'smoke', x: car.x, y: car.y, t: 0.7 });
      }
    }
    for (const [id, g] of this.carGroups) {
      if (!seenCars.has(id)) {
        this.scene.remove(g);
        this.carGroups.delete(id);
      }
    }

    // Pedestrians.
    const seenPeds = new Set();
    for (const ped of game.peds) {
      seenPeds.add(ped);
      let g = this.pedGroups.get(ped);
      if (!g) {
        g = this.buildPerson(ped.shirt, ped.skin, false);
        this.pedGroups.set(ped, g);
        this.scene.add(g);
      }
      if (ped.down) {
        g.position.set(ped.x, 3, ped.y);
        g.rotation.set(Math.PI / 2, 0, 0);
      } else {
        g.position.set(ped.x, Math.abs(Math.sin(ped.walkPhase)) * 1.6, ped.y);
        g.rotation.set(0, -ped.angle, 0);
        const swing = Math.sin(ped.walkPhase) * 0.5;
        g.userData.legL.rotation.x = swing;
        g.userData.legR.rotation.x = -swing;
      }
    }
    for (const [ped, g] of this.pedGroups) {
      if (!seenPeds.has(ped)) {
        this.scene.remove(g);
        this.pedGroups.delete(ped);
      }
    }

    // The player on foot (hidden while driving).
    this.playerGroup.visible = !p.driving;
    if (!p.driving) {
      this.playerGroup.position.set(p.x, Math.abs(Math.sin(time * 9)) * (p.speed > 0 ? 1.6 : 0), p.y);
      this.playerGroup.rotation.y = -p.angle;
      const swing = Math.sin(time * 9) * (p.speed > 0 ? 0.5 : 0);
      this.playerGroup.userData.legL.rotation.x = swing;
      this.playerGroup.userData.legR.rotation.x = -swing;
    }
    this.playerRing.position.set(p.x, 1.2, p.y);
    this.playerRing.material.opacity = 0.6 + Math.sin(time * 3) * 0.25;

    // Mission marker: ring + bouncing arrow.
    const marker = game.missions.marker();
    const hasMarker = !!marker;
    this.markerRing.visible = hasMarker;
    this.markerArrow.visible = hasMarker;
    if (hasMarker) {
      const pulse = 1 + Math.sin(time * 4) * 0.08;
      this.markerRing.position.set(marker.x, 2, marker.y);
      this.markerRing.scale.set(pulse, pulse, 1);
      this.markerArrow.position.set(marker.x, 78 + Math.sin(time * 3) * 9, marker.y);
      this.markerArrow.rotation.y = time * 1.5;
    }

    // Coins: cash drops, stashes, and the fare marker.
    for (const c of this.coins) c.used = false;
    const coinSpots = [];
    if (game.missions.index === 2 && game.missions.active) {
      for (const d of game.missions.drops) {
        if (!d.taken) coinSpots.push({ x: d.x, y: d.y });
      }
    }
    if (game.stashes) {
      for (const s of game.stashes) {
        if (!s.taken) coinSpots.push({ x: s.x, y: s.y });
      }
    }
    if (game.fare && game.fare.state === 'waiting' && game.fare.ped) {
      coinSpots.push({ x: game.fare.ped.x, y: game.fare.ped.y, green: true });
    }
    if (game.fare && game.fare.state === 'riding' && game.fare.dest) {
      coinSpots.push({ x: game.fare.dest.x, y: game.fare.dest.y, green: true });
    }
    let ci = 0;
    for (const spot of coinSpots) {
      if (ci >= this.coins.length) break;
      const slot = this.coins[ci];
      ci += 1;
      slot.used = true;
      slot.coin.visible = true;
      slot.ring.visible = true;
      slot.coin.position.set(spot.x, 34 + Math.sin(time * 3 + spot.x) * 5, spot.y);
      slot.coin.rotation.y = time * 2.2;
      slot.coin.rotation.x = Math.PI / 2;
      slot.ring.position.set(spot.x, 1.4, spot.y);
      slot.ring.material = spot.green
        ? (this._greenRingMat || (this._greenRingMat = new THREE.MeshBasicMaterial({ color: 0x3aa655, transparent: true, opacity: 0.8, side: THREE.DoubleSide })))
        : this.coinRingMat;
      slot.coin.material = spot.green
        ? (this._greenCoinMat || (this._greenCoinMat = new THREE.MeshLambertMaterial({ color: 0x3aa655, emissive: 0x0a3a14 })))
        : this.coinMat;
    }
    for (const slot of this.coins) {
      if (!slot.used) {
        slot.coin.visible = false;
        slot.ring.visible = false;
      }
    }

    // Bullets.
    for (let i = 0; i < this.bullets.length; i += 1) {
      const b = game.bullets[i];
      const mesh = this.bullets[i];
      if (b) {
        mesh.visible = true;
        mesh.position.set(b.x, 12, b.y);
        mesh.rotation.y = -b.angle;
      } else {
        mesh.visible = false;
      }
    }

    // Particles.
    const durations = { flash: 0.08, smoke: 0.7, explosion: 0.6 };
    for (let i = 0; i < this.particles.length; i += 1) {
      const pt = game.particles[i];
      const mesh = this.particles[i];
      if (!pt) {
        mesh.visible = false;
        continue;
      }
      const max = durations[pt.kind] || 0.5;
      const frac = Math.max(0, pt.t / max); // 1 at birth, 0 at death
      mesh.visible = true;
      mesh.material = this.particleMats[pt.kind] || this.particleMats.smoke;
      mesh.position.set(pt.x, pt.kind === 'smoke' ? 14 : 10, pt.y);
      const size = pt.kind === 'explosion' ? 8 + (1 - frac) * 34
        : pt.kind === 'smoke' ? 7 + (1 - frac) * 20 : 7;
      mesh.scale.set(size, size, size);
      mesh.material.opacity = pt.kind === 'flash' ? frac : frac * 0.75;
    }

    // Skid marks.
    for (let i = 0; i < this.skids.length; i += 1) {
      const sk = game.skids[i];
      const mesh = this.skids[i];
      if (sk) {
        mesh.visible = true;
        mesh.position.set(sk.x, 1, sk.y);
        mesh.rotation.y = -sk.angle;
        mesh.material.opacity = Math.min(0.5, (sk.t / 5) * 0.5);
      } else {
        mesh.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

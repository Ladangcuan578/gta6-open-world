// Solstice City — the 3D renderer: three.js draws the same 2D simulation
// (city grid, cars, peds, player) as a neon-sunset 3D city. Driving uses a
// low third-person chase cam behind the car; on foot the camera is a
// high-angle 3/4 view, fixed north-up. The ground is one textured plane
// from the prerendered city canvas; buildings, trees, cars and people are
// 3D objects with shadows, lit windows, neon signs and headlights.
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

// One facade texture: a base wall colour with a grid of windows, plus an
// emissive twin so a warm subset of the windows glows at dusk. The lit
// pattern is a deterministic hash of the window cell and the variant seed,
// so the same building always lights the same windows.
function makeFacadeTexture(base, frame, litSeed) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = base;
  c.fillRect(0, 0, 128, 128);
  const ev = document.createElement('canvas');
  ev.width = 128;
  ev.height = 128;
  const e = ev.getContext('2d');
  e.fillStyle = '#000000';
  e.fillRect(0, 0, 128, 128);
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
      // About a third of the windows are lit, warm amber.
      if (hash2(col * 7 + litSeed, row * 11 + litSeed) < 0.36) {
        e.fillStyle = '#ffca7a';
        e.fillRect(x, y, 18, 20);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const emissive = new THREE.CanvasTexture(ev);
  emissive.wrapS = THREE.RepeatWrapping;
  emissive.wrapT = THREE.RepeatWrapping;
  emissive.colorSpace = THREE.SRGBColorSpace;
  return { map: tex, emissive };
}

// A neon sign texture: glowing words on a near-black board.
function makeSignTexture(word, color) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = '#12040d';
  c.fillRect(0, 0, 256, 96);
  c.strokeStyle = color;
  c.lineWidth = 6;
  c.strokeRect(5, 5, 246, 86);
  c.fillStyle = color;
  c.font = 'bold 44px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = color;
  c.shadowBlur = 18;
  c.fillText(word, 128, 50);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The sunset sky as a vertical gradient: deep purple overhead, magenta in
// the middle, orange at the horizon.
function makeSkyTexture() {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 512;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, CFG.SUNSET.skyTop);
  g.addColorStop(0.45, CFG.SUNSET.skyMid);
  g.addColorStop(0.78, CFG.SUNSET.skyLow);
  g.addColorStop(1, '#ffb347');
  c.fillStyle = g;
  c.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft radial glow for the low sun on the horizon.
function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255, 220, 160, 1)');
  g.addColorStop(0.35, 'rgba(255, 150, 70, 0.75)');
  g.addColorStop(1, 'rgba(255, 110, 60, 0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
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
  taxi: [48, 11, 24],
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
    this.renderer.toneMappingExposure = CFG.SUNSET.exposure;

    this.scene = new THREE.Scene();
    // Neon sunset: a gradient sky, pink haze, a low warm sun.
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(CFG.SUNSET.fogColor, CFG.SUNSET.fogNear, CFG.SUNSET.fogFar);

    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 9000);
    this.camera.position.set(0, 620, 440);
    this.camera.lookAt(0, 0, 0);
    this._fov = 55;
    this._chasePos = new THREE.Vector3(0, 62, 0);
    this._lastTime = -1;

    // Sun and sky: the sun hangs low in the south-east so the streets get
    // long sunset shadows and the facades catch warm light.
    const hemi = new THREE.HemisphereLight(CFG.SUNSET.hemiSky, CFG.SUNSET.hemiGround, CFG.SUNSET.hemiIntensity);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(CFG.SUNSET.sunColor, CFG.SUNSET.sunIntensity);
    this.sun.castShadow = true;
    // Software renderers get a 512px shadow map: the shadow pass is a full
    // scene render, and at dusk the softer shadows suit the light anyway.
    this.sun.shadow.mapSize.set(software ? 512 : 2048, software ? 512 : 2048);
    this.sun.shadow.camera.left = -520;
    this.sun.shadow.camera.right = 520;
    this.sun.shadow.camera.top = 520;
    this.sun.shadow.camera.bottom = -520;
    this.sun.shadow.camera.near = 50;
    this.sun.shadow.camera.far = 2600;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // The sun's glow on the horizon, following the focus.
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.sunGlow.scale.set(1500, 900, 1);
    this.scene.add(this.sunGlow);

    // The player's headlights: one spotlight that lights the road ahead
    // of their car, plus a warm pool of light on the asphalt.
    this.headlight = new THREE.SpotLight(0xffe6b0, 0, CFG.HEADLIGHT_RANGE, 0.5, 0.6, 1.2);
    this.headlight.castShadow = false;
    this.scene.add(this.headlight);
    this.scene.add(this.headlight.target);
    const poolGeo = new THREE.PlaneGeometry(200, 140);
    this.headlightPool = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
      map: makeGlowTexture(), color: 0xffd9a0, transparent: true, opacity: 0.30,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.headlightPool.rotation.x = -Math.PI / 2;
    this.headlightPool.visible = false;
    this.scene.add(this.headlightPool);

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

    // Building materials: five shared facades with lit windows, roofs from
    // the palette. The emissive map makes a third of the windows glow amber.
    this.facades = [
      ['#e0c9a8', '#c9b48a', 1],
      ['#d4b89a', '#b59a72', 2],
      ['#c4c4a8', '#a8b394', 3],
      ['#d8b892', '#b08a5e', 4],
      ['#b8c4c4', '#8a9aa0', 5],
    ].map(([base, frame, seed]) => {
      const { map, emissive } = makeFacadeTexture(base, frame, seed);
      return new THREE.MeshLambertMaterial({ map, emissive, emissiveMap: emissive, emissiveIntensity: 0.85 });
    });
    this.roofs = PAL.roofs.map(
      (color) => new THREE.MeshLambertMaterial({ color }),
    );
    this.bottomMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    this.buildBuildings(game.city);
    this.buildSkyline();
    this.buildTrafficLights();

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
      new THREE.TorusGeometry(36, 3, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.9 }),
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

    // The police helicopter: body, tail, skids, a spinning main rotor and a
    // searchlight cone that sweeps the street below. Hidden until 4 stars.
    this.heli = new THREE.Group();
    const heliBodyMat = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
    const heliBody = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 16), heliBodyMat);
    heliBody.castShadow = true;
    this.heli.add(heliBody);
    const heliGlass = new THREE.Mesh(
      new THREE.BoxGeometry(10, 8, 14),
      new THREE.MeshLambertMaterial({ color: 0x3a5a7a }),
    );
    heliGlass.position.set(16, -1, 0);
    this.heli.add(heliGlass);
    const heliTail = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 5), heliBodyMat);
    heliTail.position.set(-28, 2, 0);
    this.heli.add(heliTail);
    const heliFin = new THREE.Mesh(new THREE.BoxGeometry(2, 12, 5), this.redLightMat);
    heliFin.position.set(-40, 6, 0);
    this.heli.add(heliFin);
    this.heliRotor = new THREE.Group();
    const rotorMat = new THREE.MeshLambertMaterial({ color: 0x111318 });
    for (const a of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(64, 1.2, 3), rotorMat);
      blade.rotation.y = a;
      this.heliRotor.add(blade);
    }
    this.heliRotor.position.y = 9;
    this.heli.add(this.heliRotor);
    // Searchlight: a narrow translucent beam from the heli to the street.
    // The cone's apex is at its top (+h/2) by construction, so with its
    // centre 65 below the heli the narrow end sits at the helicopter and
    // the wide end paints a soft pool on the street below. Kept narrow
    // and faint on purpose: a wide cone turns into a solid wash across
    // the whole frame whenever the heli swings near the chase camera.
    this.heliCone = new THREE.Mesh(
      new THREE.ConeGeometry(30, 130, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2c8, transparent: true, opacity: 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.heliCone.position.y = -65;
    this.heli.add(this.heliCone);
    this.heli.visible = false;
    this.scene.add(this.heli);
    this.heliPool = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshBasicMaterial({
        map: makeGlowTexture(), color: 0xfff2c8, transparent: true, opacity: 0.30,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.heliPool.rotation.x = -Math.PI / 2;
    this.heliPool.visible = false;
    this.scene.add(this.heliPool);

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
    const signDefs = [
      ['HOTEL', '#ff2e88'],
      ['BAR', '#00e5ff'],
      ['TACOS', '#ff7a1a'],
      ['NEON', '#7a4dff'],
      ['CASINO', '#ffd23e'],
      ['24H', '#3aff8a'],
    ];
    this.signMats = signDefs.map(([word, color]) => new THREE.MeshBasicMaterial({ map: makeSignTexture(word, color) }));
    const towerSpots = [];
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
      // Neon sign on the south face of about one building in eleven.
      if (h > 40 && hash2(b.x + 21, b.y + 13) < 0.09) {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(46, 17),
          this.signMats[Math.floor(hash2(b.x + 31, b.y + 17) * this.signMats.length)],
        );
        sign.position.set(b.x + b.w / 2, h * 0.58, b.y + b.h + 1.6);
        this.scene.add(sign);
      }
      // Water tower on the roof of the tallest few.
      if (h > 60 && hash2(b.x + 41, b.y + 23) < 0.14) {
        towerSpots.push({ x: b.x + b.w * 0.3, y: b.y + b.h * 0.3, roof: h });
      }
    }
    // Water towers: one instanced tank + one instanced cone roof each.
    if (towerSpots.length > 0) {
      const tankGeo = new THREE.CylinderGeometry(8, 8, 14, 10);
      const tankMat = new THREE.MeshLambertMaterial({ color: 0x8a6a4a });
      const tanks = new THREE.InstancedMesh(tankGeo, tankMat, towerSpots.length);
      const coneGeo = new THREE.ConeGeometry(9, 7, 10);
      const coneMat = new THREE.MeshLambertMaterial({ color: 0x6a4a34 });
      const cones = new THREE.InstancedMesh(coneGeo, coneMat, towerSpots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();
      towerSpots.forEach((t, i) => {
        pos.set(t.x, t.roof + 10, t.y);
        m.compose(pos, q, s);
        tanks.setMatrixAt(i, m);
        pos.set(t.x, t.roof + 20, t.y);
        m.compose(pos, q, s);
        cones.setMatrixAt(i, m);
      });
      tanks.instanceMatrix.needsUpdate = true;
      cones.instanceMatrix.needsUpdate = true;
      tanks.castShadow = true;
      this.scene.add(tanks);
      this.scene.add(cones);
    }
  }

  // A ring of dark skyline silhouettes beyond the city edge, so the horizon
  // never ends in flat fog: the island-city feel in every wide shot.
  buildSkyline() {
    const skyMat = new THREE.MeshLambertMaterial({ color: 0x241233 });
    const litMat = new THREE.MeshLambertMaterial({
      color: 0x2a1638, emissive: 0xffca7a, emissiveIntensity: 0.25,
    });
    for (let i = 0; i < 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      const rx = WORLD_W / 2 + Math.cos(a) * (2300 + hash2(i, 3) * 500);
      const rz = WORLD_H / 2 + Math.sin(a) * (2600 + hash2(i, 7) * 500);
      const w = 160 + hash2(i, 11) * 220;
      const h = 150 + hash2(i, 13) * 300;
      const d = 160 + hash2(i, 17) * 220;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        hash2(i, 19) < 0.4 ? litMat : skyMat,
      );
      mesh.position.set(rx, h / 2, rz);
      this.scene.add(mesh);
    }
  }

  // Traffic lights at every fourth intersection: a pole, a head, and red /
  // green lamps that flip on an 8-second cycle (deterministic per clock).
  buildTrafficLights() {
    const spots = [];
    for (let gx = 0; gx <= CFG.GRID; gx += 4) {
      for (let gy = 0; gy <= CFG.GRID; gy += 4) {
        spots.push({ x: gx * CFG.PITCH + 42, y: gy * CFG.PITCH + 42, phase: (gx + gy) % 2 });
      }
    }
    this.trafficSpots = spots;
    const count = spots.length;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const poleGeo = new THREE.CylinderGeometry(1.6, 2, 34, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3238 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, count);
    const headGeo = new THREE.BoxGeometry(7, 16, 7);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, count);
    for (let i = 0; i < count; i += 1) {
      pos.set(spots[i].x, 17, spots[i].y);
      m.compose(pos, q, s);
      poles.setMatrixAt(i, m);
      pos.set(spots[i].x, 36, spots[i].y);
      m.compose(pos, q, s);
      heads.setMatrixAt(i, m);
    }
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.scene.add(poles);
    this.scene.add(heads);
    const lampGeo = new THREE.SphereGeometry(2.4, 8, 6);
    this.redLamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1e }), count);
    this.greenLamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x3aff8a }), count);
    this.redLamps.instanceMatrix.needsUpdate = true;
    this.greenLamps.instanceMatrix.needsUpdate = true;
    this.scene.add(this.redLamps);
    this.scene.add(this.greenLamps);
  }

  buildTrees(city) {
    // Island city: about half the trees are palms — a tall thin trunk with
    // six fronds fanning out at the top. The rest are round canopies.
    const palms = city.trees.filter((t) => hash2(t.x + 5, t.y + 9) < 0.45);
    const round = city.trees.filter((t) => hash2(t.x + 5, t.y + 9) >= 0.45);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const greens = [new THREE.Color(0x4a8a3a), new THREE.Color(0x5a9a44), new THREE.Color(0x3f7a34)];
    const count = round.length;
    const trunkGeo = new THREE.CylinderGeometry(2.5, 3.5, 14, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const canopyGeo = new THREE.IcosahedronGeometry(11, 1);
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
    for (let i = 0; i < count; i += 1) {
      const t = round[i];
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
    if (palms.length > 0) {
      const palmTrunkGeo = new THREE.CylinderGeometry(1.8, 2.8, 26, 6);
      const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
      const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palms.length);
      const frondGeo = new THREE.ConeGeometry(9, 4, 6);
      const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8a34 });
      const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palms.length * 6);
      const euler = new THREE.Euler();
      let fi = 0;
      palms.forEach((t, i) => {
        pos.set(t.x, 13, t.y);
        s.set(1, 1, 1);
        m.compose(pos, q, s);
        palmTrunks.setMatrixAt(i, m);
        for (let f = 0; f < 6; f += 1) {
          const yaw = (f / 6) * Math.PI * 2 + hash2(t.x, t.y) * 0.6;
          // The cone's tip points outward and droops down from the crown.
          euler.set(0, yaw, -Math.PI / 2 - 0.55);
          q.setFromEuler(euler);
          pos.set(t.x + Math.cos(yaw) * 7, 25, t.y + Math.sin(yaw) * 7);
          s.set(1.6, 0.5, 1);
          m.compose(pos, q, s);
          fronds.setMatrixAt(fi, m);
          fi += 1;
        }
      });
      palmTrunks.instanceMatrix.needsUpdate = true;
      fronds.instanceMatrix.needsUpdate = true;
      palmTrunks.castShadow = true;
      fronds.castShadow = true;
      this.scene.add(palmTrunks);
      this.scene.add(fronds);
    }
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
    // Warm pools of light on the asphalt under every lamp: at dusk the
    // streets look wet and lit, even though the road is one flat texture.
    // A soft radial falloff (not a hard-edged disc) so the pools melt into
    // the road instead of reading as grey circles.
    const poolTex = makeGlowTexture();
    const poolGeo = new THREE.PlaneGeometry(64, 64);
    const poolMat = new THREE.MeshBasicMaterial({
      map: poolTex, color: 0xffd9a0, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, count);
    // PlaneGeometry lies in the XY plane: lay every pool flat on the road.
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    for (let i = 0; i < count; i += 1) {
      pos.set(spots[i].x, 1.1, spots[i].y);
      m.compose(pos, flat, s);
      pools.setMatrixAt(i, m);
    }
    pools.instanceMatrix.needsUpdate = true;
    this.scene.add(pools);
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
    // Hood and trunk steps: a lower nose and a raised rear deck so the
    // silhouette reads as a car, not a box.
    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.22, hgt * 0.45, wid * 0.94),
      this.bodyMat(car.color),
    );
    hood.position.set(len * 0.36, 4 + hgt * 0.72, 0);
    g.add(hood);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.18, hgt * 0.4, wid * 0.94),
      this.bodyMat(car.color),
    );
    deck.position.set(-len * 0.38, 4 + hgt * 0.75, 0);
    g.add(deck);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(len * 0.48, 8, wid * 0.82),
      this.glassMat,
    );
    cabin.position.set(-len * 0.04, 4 + hgt + 4, 0);
    cabin.castShadow = true;
    g.add(cabin);
    // Bumpers and mirrors.
    const bumpMat = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
    for (const sx of [-1, 1]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(3, 4, wid * 0.96), bumpMat);
      bump.position.set(sx * (len / 2 + 0.5), 5.5, 0);
      g.add(bump);
      for (const sz of [-1, 1]) {
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 2.5), bumpMat);
        mirror.position.set(len * 0.14, 4 + hgt + 3, sz * (wid / 2 + 1));
        g.add(mirror);
      }
    }
    // Headlights (warm white, always on at dusk) and taillights (red).
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1e });
    for (const sz of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(2, 3.5, 5), headMat);
      head.position.set(len / 2 + 0.6, 4 + hgt * 0.62, sz * (wid / 2 - 4.5));
      g.add(head);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 3.5, 5), tailMat);
      tail.position.set(-len / 2 - 0.6, 4 + hgt * 0.62, sz * (wid / 2 - 4.5));
      g.add(tail);
    }
    // Sport cars get a spoiler; taxis get a lit roof sign.
    if (car.type === 'sport') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, wid * 0.9), bumpMat);
      spoiler.position.set(-len / 2 + 1, 4 + hgt + 1.5, 0);
      g.add(spoiler);
    }
    if (car.type === 'taxi') {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(12, 4, 7),
        new THREE.MeshBasicMaterial({ color: 0xffd23e }),
      );
      sign.position.set(-len * 0.04, 4 + hgt + 10, 0);
      g.add(sign);
    }
    // Wheels in groups so they can spin with the car's speed.
    const wy = 4.5;
    const wx = len / 2 - 9;
    const wz = wid / 2 - 1;
    g.userData.wheels = [];
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * wx, wy, sz * wz);
      const wheel = new THREE.Mesh(this.wheelGeo, this.wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);
      g.add(pivot);
      g.userData.wheels.push(pivot);
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
    const dt = this._lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, time - this._lastTime));
    this._lastTime = time;

    // Camera. Driving: a low third-person chase cam behind the car, smooth
    // follow, FOV widening with speed, a subtle shake only on explosions.
    // On foot: the high-angle 3/4 view, north-up, steep enough that a tall
    // building south of the player rarely blocks the view.
    const speedRatio = p.driving ? Math.min(Math.abs(p.inCar.speed) / 570, 1) : 0;
    const fov = 55 + speedRatio * 10;
    if (fov !== this._fov) {
      this._fov = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const shake = game.shake || 0;
    const shX = shake > 0 ? Math.sin(time * 47) * shake * 6 : 0;
    const shY = shake > 0 ? Math.sin(time * 39) * shake * 4 : 0;
    const shZ = shake > 0 ? Math.cos(time * 43) * shake * 6 : 0;
    if (p.driving) {
      const car = p.inCar;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      // Behind the car, low, looking ahead down the street.
      const wantX = car.x - fx * 150;
      const wantZ = car.y - fy * 150;
      const wantY = 62;
      if (focus.snapped) {
        this._chasePos.set(wantX, wantY, wantZ);
        focus.snapped = false;
      } else if (dt > 0) {
        const k = 1 - Math.pow(0.0001, dt);
        this._chasePos.x += (wantX - this._chasePos.x) * k;
        this._chasePos.y += (wantY - this._chasePos.y) * k;
        this._chasePos.z += (wantZ - this._chasePos.z) * k;
      }
      this.camera.position.set(
        this._chasePos.x + shX,
        this._chasePos.y + shY,
        this._chasePos.z + shZ,
      );
      this.camera.lookAt(car.x + fx * 90, 18, car.y + fy * 90);
    } else {
      // On foot: a high-angle 3/4 view, north-up. A little lower and
      // further back than the old 60-degree view (about 55 degrees) so the
      // facades and street life read, not just the roofs.
      const H = 420 + speedRatio * 110;
      const D = 290 + speedRatio * 70;
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
      this.camera.position.x += shX;
      this.camera.position.y += shY;
      this.camera.position.z += shZ;
      this.camera.lookAt(focus.x, 0, focus.y);
    }

    // The low sun follows the player so shadows stay crisp nearby; the
    // glow on the horizon follows too.
    this.sun.position.set(focus.x + 950, CFG.SUNSET.sunHeight, focus.y + 420);
    this.sun.target.position.set(focus.x, 0, focus.y);
    this.sun.target.updateMatrixWorld();
    this.sunGlow.position.set(focus.x + 1900, 330, focus.y + 840);

    // Traffic lights flip every 8 seconds, offset per intersection.
    if (this.trafficSpots) {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const on = new THREE.Vector3(1, 1, 1);
      const off = new THREE.Vector3(0.001, 0.001, 0.001);
      const pos = new THREE.Vector3();
      this.trafficSpots.forEach((spot, i) => {
        const green = (Math.floor(time / CFG.TRAFFIC_LIGHT_CYCLE) + spot.phase) % 2 === 0;
        pos.set(spot.x, 40, spot.y);
        m.compose(pos, q, green ? off : on);
        this.redLamps.setMatrixAt(i, m);
        pos.set(spot.x, 33, spot.y);
        m.compose(pos, q, green ? on : off);
        this.greenLamps.setMatrixAt(i, m);
      });
      this.redLamps.instanceMatrix.needsUpdate = true;
      this.greenLamps.instanceMatrix.needsUpdate = true;
    }

    // The player's headlights: a spotlight and a pool of light on the road
    // ahead of their car, on at dusk unless they pressed L.
    const headOn = p.driving && p.inCar.headlights !== false && game.input.lightsOn;
    if (headOn) {
      const car = p.inCar;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      this.headlight.position.set(car.x, 14, car.y);
      this.headlight.target.position.set(car.x + fx * 500, 0, car.y + fy * 500);
      this.headlight.target.updateMatrixWorld();
      this.headlight.intensity = 1600;
      this.headlightPool.visible = true;
      this.headlightPool.position.set(car.x + fx * 130, 1.2, car.y + fy * 130);
      this.headlightPool.rotation.z = -car.angle;
    } else {
      this.headlight.intensity = 0;
      this.headlightPool.visible = false;
    }

    // The police helicopter: hovers over the player, rotor spinning, its
    // searchlight cone sweeping the street. It flies low enough (130) to
    // read in the chase cam's frame, high enough to clear the rooftops.
    if (game.heli && game.heli.active) {
      this.heli.visible = true;
      this.heliPool.visible = true;
      this.heli.position.set(game.heli.x, 130, game.heli.y);
      this.heli.rotation.y = -Math.atan2(p.y - game.heli.y, p.x - game.heli.x);
      this.heliRotor.rotation.y = time * 30;
      this.heliCone.rotation.y = Math.sin(time * 0.7) * 0.25;
      this.heliPool.position.set(game.heli.x, 1.3, game.heli.y);
    } else {
      this.heli.visible = false;
      this.heliPool.visible = false;
    }

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
      // Wheels spin with the car's speed.
      if (g.userData.wheels) {
        for (const pivot of g.userData.wheels) pivot.rotation.z = car.wheelSpin || 0;
      }
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
        g = this.buildPerson(ped.shirt, ped.skin, !!ped.cap);
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
    // The player ring marks Rico on foot; in a car the chase cam is already
    // right behind him, so the ring hides while driving.
    this.playerRing.visible = !p.driving;
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
    // Missions 3 and 6 both scatter cash drops.
    if ((game.missions.index === 2 || game.missions.index === 5) && game.missions.active) {
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

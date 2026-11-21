// Solstice City itself: a 10x10-block neon-sunset coastal city, built procedurally
// from a seed. Roads and markings are one crisp canvas texture, buildings wear
// canvas facades with lit windows, neon signs glow, and the sun sits low in the
// west. Districts: Downtown towers, Old Town brick, Uptown flats, Portside
// warehouses, Beachfront villas, Palm Park, Solstice Plaza and an airfield.
import * as THREE from 'three';
import { WORLD, DISTRICT_STYLE, PALETTE, districtOf, roadLines, blockCentre } from './config.js';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function facadeTexture(rng, style, tall) {
  const cols = tall ? 10 : 7;
  const rows = tall ? 22 : 9;
  return canvasTexture(256, 512, (g, w, h) => {
    const base = new THREE.Color().setHSL(style.hue, 0.32, tall ? 0.22 : 0.34);
    g.fillStyle = `#${base.getHexString()}`;
    g.fillRect(0, 0, w, h);
    // Subtle vertical shading so the face reads as panels, not flat colour.
    for (let x = 0; x < w; x += 32) {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(x, 0, 2, h);
    }
    const cw = w / cols;
    const ch = h / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = rng.next() < style.lit;
        g.fillStyle = lit ? '#ffd27a' : '#20283f';
        g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.5);
        if (lit && rng.next() < 0.3) {
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.25, cw * 0.56, ch * 0.18);
        }
      }
    }
    // Ground floor: shops and doors.
    g.fillStyle = '#1a1218';
    g.fillRect(0, h - 46, w, 46);
    for (let x = 8; x < w - 20; x += 44) {
      g.fillStyle = rng.next() < 0.6 ? '#ffb84d' : '#3a2b33';
      g.fillRect(x, h - 40, 30, 34);
    }
  });
}

function neonTexture(text, color) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 84px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 26;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,210,122,0.85)');
    grad.addColorStop(0.5, 'rgba(255,180,80,0.28)');
    grad.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function cloudTexture(rng) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 14; i += 1) {
      const x = rng.range(30, w - 30);
      const y = rng.range(40, h - 30);
      const r = rng.range(18, 42);
      const grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(255,190,170,0.55)');
      grad.addColorStop(1, 'rgba(255,190,170,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function groundTexture(rng) {
  const S = 2048;
  const scale = S / (WORLD.SIZE + 260); // world metres -> px (extra for beach + water edge)
  const ox = (S - WORLD.SIZE * scale) / 2;
  const toPx = (m) => ox + (m + WORLD.HALF) * scale;
  return canvasTexture(S, S, (g) => {
    g.fillStyle = '#57504a'; // sidewalks everywhere first
    g.fillRect(0, 0, S, S);
    // Faint sidewalk tile joints so the pavement is not a flat slab.
    g.strokeStyle = 'rgba(0,0,0,0.10)';
    g.lineWidth = 1;
    for (let v = -WORLD.HALF - 130; v <= WORLD.HALF + 130; v += 8) {
      g.beginPath(); g.moveTo(toPx(v), 0); g.lineTo(toPx(v), S); g.stroke();
      g.beginPath(); g.moveTo(0, toPx(v)); g.lineTo(S, toPx(v)); g.stroke();
    }
    // Beach sand along the south edge, then the bay beyond it.
    g.fillStyle = '#d9b380';
    g.fillRect(0, toPx(WORLD.HALF - 34), S, toPx(WORLD.HALF) - toPx(WORLD.HALF - 34));
    // Park and plaza ground.
    for (let bx = 0; bx < WORLD.GRID; bx += 1) {
      for (let bz = 0; bz < WORLD.GRID; bz += 1) {
        const d = districtOf(bx, bz);
        const c = blockCentre(bx, bz);
        const x0 = toPx(c.x - WORLD.BLOCK / 2);
        const z0 = toPx(c.z - WORLD.BLOCK / 2);
        const bw = WORLD.BLOCK * scale;
        if (d === 'park') {
          g.fillStyle = '#3f7a44';
          g.fillRect(x0, z0, bw, bw);
          g.fillStyle = '#356b39';
          for (let i = 0; i < 5; i += 1) g.fillRect(x0 + rng.range(0, bw - 30), z0 + rng.range(0, bw - 30), 30, 30);
        } else if (d === 'plaza') {
          g.fillStyle = '#8d7f8a';
          g.fillRect(x0, z0, bw, bw);
          g.strokeStyle = '#a89aa2';
          g.lineWidth = 3;
          for (let i = 1; i < 4; i += 1) {
            g.strokeRect(x0 + (bw / 4) * i, z0 + (bw / 4) * i, bw - (bw / 2) * i, bw - (bw / 2) * i);
          }
        } else if (d === 'airfield') {
          g.fillStyle = '#4a4a52';
          g.fillRect(x0, z0, bw, bw);
        }
      }
    }
    // Roads: dark asphalt bands on every grid line.
    const lines = roadLines();
    g.fillStyle = '#655e6e';
    for (const L of lines) {
      g.fillRect(0, toPx(L - WORLD.ROAD / 2), S, WORLD.ROAD * scale);
      g.fillRect(toPx(L - WORLD.ROAD / 2), 0, WORLD.ROAD * scale, S);
    }
    // Lane dashes and crosswalks.
    g.fillStyle = '#e8c33a';
    for (const L of lines) {
      for (let m = -WORLD.HALF + 20; m < WORLD.HALF - 10; m += 16) {
        g.fillRect(toPx(m), toPx(L) - 1.5, 8 * scale, 3);
        g.fillRect(toPx(L) - 1.5, toPx(m), 3, 8 * scale);
      }
    }
    // No crosswalk stripes: at the chase camera's glancing angle a painted
    // stripe magnifies into a giant bar. Intersections read from the road
    // grid and the lane dashes alone.
  });
}

export function createCity(scene, rng) {
  const colliders = [];
  const trafficLights = [];
  const clouds = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- Sky, sun, fog -------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(1400, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      mid: { value: new THREE.Color(PALETTE.skyMid) },
      low: { value: new THREE.Color(PALETTE.skyLow) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.8, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }`,
  });
  group.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(PALETTE.fog, 220, 950);

  // Sun disc low in the west.
  const sunTex = glowTexture();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: 0xffd27a, transparent: true, depthWrite: false }));
  sun.position.set(-900, 150, 120);
  sun.scale.set(420, 420, 1);
  group.add(sun);

  // Drifting clouds.
  const cloudTex = cloudTexture(rng);
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Mesh(
      new THREE.PlaneGeometry(rng.range(180, 320), rng.range(50, 90)),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    cloud.position.set(rng.range(-900, 900), rng.range(180, 320), rng.range(-700, 300));
    cloud.userData.speed = rng.range(1.5, 4);
    group.add(cloud);
    clouds.push(cloud);
  }

  // ---- Lights ---------------------------------------------------------------
  const sunLight = new THREE.DirectionalLight(0xffb36b, 2.7);
  sunLight.position.set(-320, 170, 140);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -380;
  sunLight.shadow.camera.right = 380;
  sunLight.shadow.camera.top = 380;
  sunLight.shadow.camera.bottom = -380;
  sunLight.shadow.camera.far = 1200;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x9a6bbf, 0x4a3840, 1.8));

  // ---- Ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.SIZE + 260, WORLD.SIZE + 260),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // The bay south of the beach.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 320),
    new THREE.MeshPhongMaterial({ color: PALETTE.water, shininess: 120, specular: 0xff9a5c, transparent: true, opacity: 0.94 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, WORLD.HALF + 160);
  group.add(water);

  // ---- Buildings ------------------------------------------------------------
  const facades = {};
  for (const [name, style] of Object.entries(DISTRICT_STYLE)) {
    facades[name] = {
      low: facadeTexture(rng, style, false),
      tall: facadeTexture(rng, style, true),
    };
  }
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x241d26 });
  const signWords = ['HOTEL', 'BAR', 'TACOS', 'NEON', 'CASINO', '24H', 'PIZZA', 'MOTEL', 'DANCE', 'SUSHI'];
  const signMats = signWords.map((w, i) => new THREE.MeshBasicMaterial({
    map: neonTexture(w, `#${new THREE.Color(PALETTE.neon[i % PALETTE.neon.length]).getHexString()}`),
    transparent: true,
  }));

  let buildingCount = 0;
  for (let bx = 0; bx < WORLD.GRID; bx += 1) {
    for (let bz = 0; bz < WORLD.GRID; bz += 1) {
      const district = districtOf(bx, bz);
      const style = DISTRICT_STYLE[district];
      if (style.maxH === 0) continue;
      const c = blockCentre(bx, bz);
      const slots = district === 'downtown' ? 4 : district === 'portside' ? 2 : 3;
      const slot = WORLD.BLOCK / Math.ceil(Math.sqrt(slots));
      for (let s = 0; s < slots; s += 1) {
        if (rng.next() < 0.12) continue;
        const sx = c.x - WORLD.BLOCK / 2 + slot / 2 + (s % Math.ceil(Math.sqrt(slots))) * slot;
        const sz = c.z - WORLD.BLOCK / 2 + slot / 2 + Math.floor(s / Math.ceil(Math.sqrt(slots))) * slot;
        const w = slot * rng.range(0.62, 0.8);
        const d = slot * rng.range(0.62, 0.8);
        const h = rng.range(style.minH, style.maxH);
        const tall = h > 34;
        const facade = new THREE.MeshLambertMaterial({
          map: tall ? facades[district].tall : facades[district].low,
          emissive: 0xffffff,
          emissiveMap: tall ? facades[district].tall : facades[district].low,
          emissiveIntensity: 0.55,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [facade, facade, roofMat, roofMat, facade, facade]);
        mesh.position.set(sx, h / 2, sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        colliders.push({ minX: sx - w / 2, maxX: sx + w / 2, minZ: sz - d / 2, maxZ: sz + d / 2, h });
        buildingCount += 1;
        // Neon sign on taller faces.
        if (h > 20 && rng.next() < style.sign) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(w * 0.9, 26), 6.5),
            signMats[Math.floor(rng.next() * signMats.length)],
          );
          sign.position.set(sx, h * rng.range(0.55, 0.8), sz + d / 2 + 0.15);
          group.add(sign);
        }
      }
    }
  }

  // ---- Streetlights with warm pools of light --------------------------------
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  const lampGeo = new THREE.SphereGeometry(0.35, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  const poolTex = glowTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffb84d, transparent: true, opacity: 0.2, depthWrite: false });
  const lines = roadLines();
  const lampPositions = [];
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = 0; j < lines.length; j += 1) {
      if ((i + j) % 2 !== 0) continue;
      lampPositions.push([lines[i] + WORLD.ROAD / 2 + 1, lines[j] - WORLD.ROAD / 2 - 1]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampPositions.length);
  const dummy = new THREE.Object3D();
  lampPositions.forEach(([x, z], index) => {
    dummy.position.set(x, 3.5, z);
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
    dummy.position.set(x, 7, z);
    dummy.updateMatrix();
    lamps.setMatrixAt(index, dummy.matrix);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.06, z);
    group.add(pool);
  });
  group.add(poles);
  group.add(lamps);

  // ---- Traffic lights ---------------------------------------------------------
  const lightPoleGeo = new THREE.CylinderGeometry(0.1, 0.12, 6, 6);
  const lightHeadGeo = new THREE.BoxGeometry(0.7, 1.9, 0.7);
  const lightHeadMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const bulbGeo = new THREE.SphereGeometry(0.22, 8, 6);
  for (let i = 1; i < lines.length - 1; i += 1) {
    for (let j = 1; j < lines.length - 1; j += 1) {
      if ((i * 7 + j * 3) % 4 !== 0) continue;
      const x = lines[i] + WORLD.ROAD / 2 + 0.6;
      const z = lines[j] - WORLD.ROAD / 2 - 0.6;
      const pole = new THREE.Mesh(lightPoleGeo, poleMat);
      pole.position.set(x, 3, z);
      group.add(pole);
      const head = new THREE.Mesh(lightHeadGeo, lightHeadMat);
      head.position.set(x, 6.4, z);
      group.add(head);
      const bulbs = [];
      for (let b = 0; b < 3; b += 1) {
        const bulb = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0x330000 }));
        bulb.position.set(x, 7.1 - b * 0.62, z + 0.38);
        group.add(bulb);
        bulbs.push(bulb);
      }
      trafficLights.push({ x, z, phase: (i + j) % 2, bulbs });
    }
  }

  // ---- Palms, park trees, props ----------------------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const frondGeo = new THREE.ConeGeometry(2.6, 2.2, 5);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2e7a3a });
  const palmSpots = [];
  for (let i = 0; i < 46; i += 1) {
    const beach = i < 26;
    const x = beach ? rng.range(-WORLD.HALF + 20, WORLD.HALF - 20) : rng.range(-WORLD.HALF, WORLD.HALF);
    const z = beach ? WORLD.HALF - rng.range(18, 30) : rng.range(-WORLD.HALF, WORLD.HALF);
    palmSpots.push([x, z]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  palmSpots.forEach(([x, z], index) => {
    dummy.position.set(x, 3.5, z);
    dummy.rotation.set(0, 0, rng.range(-0.08, 0.08));
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    dummy.position.set(x, 7.6, z);
    dummy.updateMatrix();
    fronds.setMatrixAt(index, dummy.matrix);
  });
  group.add(trunks);
  group.add(fronds);

  // Plaza fountain and boardwalk benches.
  const plaza = blockCentre(4, 7);
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.4, 20),
    new THREE.MeshPhongMaterial({ color: 0x9fb4c8, shininess: 90 }),
  );
  fountain.position.set(plaza.x, 0.7, plaza.z);
  group.add(fountain);
  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 1.6, 5, 8),
    new THREE.MeshPhongMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7 }),
  );
  jet.position.set(plaza.x, 3.4, plaza.z);
  group.add(jet);
  colliders.push({ minX: plaza.x - 8, maxX: plaza.x + 8, minZ: plaza.z - 8, maxZ: plaza.z + 8 });

  // Airfield runway + hangar + parked plane silhouette.
  const air = blockCentre(8, 0);
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 120),
    new THREE.MeshLambertMaterial({ color: 0x33333a }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.rotation.z = Math.PI / 2;
  runway.position.set(air.x, 0.08, air.z);
  group.add(runway);
  const hangar = new THREE.Mesh(
    new THREE.BoxGeometry(30, 10, 20),
    new THREE.MeshLambertMaterial({ color: 0x5a6a72 }),
  );
  hangar.position.set(air.x + 40, 5, air.z);
  hangar.castShadow = true;
  group.add(hangar);
  colliders.push({ minX: air.x + 25, maxX: air.x + 55, minZ: air.z - 10, maxZ: air.z + 10 });

  return {
    group,
    colliders,
    trafficLights,
    buildingCount,
    update(dt, time) {
      for (const cloud of clouds) {
        cloud.position.x += cloud.userData.speed * dt;
        if (cloud.position.x > 1000) cloud.position.x = -1000;
      }
      // Traffic lights: 8-second cycle, NS green then EW green, 1 s amber between.
      const cycle = (time % 16) / 16;
      for (const light of trafficLights) {
        const nsGreen = light.phase === 0 ? cycle < 0.4375 : cycle >= 0.5 && cycle < 0.9375;
        const amber = light.phase === 0
          ? (cycle >= 0.4375 && cycle < 0.5) || cycle >= 0.9375
          : (cycle >= 0.9375 || cycle < 0.0625) || (cycle >= 0.4375 && cycle < 0.5);
        const colors = nsGreen ? [0x330000, 0x220000, 0x00ff66] : amber ? [0x330000, 0xffaa00, 0x003300] : [0xff2222, 0x220000, 0x003300];
        light.bulbs.forEach((bulb, i) => bulb.material.color.setHex(colors[i]));
        light.nsGreen = nsGreen;
      }
    },
  };
}

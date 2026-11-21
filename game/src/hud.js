// The HUD: minimap with live blips, wanted stars and the SCPD panel, health and
// money, weapon and ammo, speedometer, radio, mission objective, toasts, banners
// and the weapon wheel. All DOM, so it renders crisp in screenshots.
import { WORLD, WEAPONS, RADIO, roadLines } from './config.js';

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const minimap = $('minimap');
  const mctx = minimap.getContext('2d');
  const lines = roadLines();
  let wheelOpen = false;
  let wheelSelected = 'pistol';

  function drawMinimap(state) {
    const S = minimap.width;
    const span = WORLD.SIZE + 80;
    const toMap = (x, z) => [((x + span / 2) / span) * S, ((z + span / 2) / span) * S];
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = '#241d2b';
    mctx.fillRect(0, 0, S, S);
    // Bay water at the south edge.
    mctx.fillStyle = '#1d4e6e';
    const [, wy] = toMap(0, WORLD.HALF + 6);
    mctx.fillRect(0, wy, S, S - wy);
    // Roads.
    mctx.strokeStyle = '#5a5560';
    mctx.lineWidth = 3;
    for (const L of lines) {
      const [x1, y1] = toMap(L, -WORLD.HALF);
      const [x2, y2] = toMap(L, WORLD.HALF);
      mctx.beginPath();
      mctx.moveTo(x1, y1);
      mctx.lineTo(x2, y2);
      mctx.stroke();
      const [hx1, hy1] = toMap(-WORLD.HALF, L);
      const [hx2, hy2] = toMap(WORLD.HALF, L);
      mctx.beginPath();
      mctx.moveTo(hx1, hy1);
      mctx.lineTo(hx2, hy2);
      mctx.stroke();
    }
    // Mission marker.
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      mctx.fillStyle = '#ffd21f';
      mctx.save();
      mctx.translate(mx, my);
      mctx.rotate(Math.PI / 4);
      const pulse = 5 + Math.sin(state.time * 5) * 1.5;
      mctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      mctx.restore();
    }
    // Traffic dots.
    mctx.fillStyle = '#e8c33a';
    for (const car of state.traffic || []) {
      const [cx, cy] = toMap(car.x, car.z);
      mctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    }
    // Police blips flash red/blue.
    const flash = Math.floor(state.time * 5) % 2 === 0;
    mctx.fillStyle = flash ? '#ff3333' : '#3388ff';
    for (const cop of state.police || []) {
      const [cx, cy] = toMap(cop.x, cop.z);
      mctx.beginPath();
      mctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      mctx.fill();
    }
    // Helicopter.
    if (state.heli) {
      mctx.fillStyle = '#ff8a00';
      const [hx, hy] = toMap(state.heli.x, state.heli.z);
      mctx.beginPath();
      mctx.arc(hx, hy, 4, 0, Math.PI * 2);
      mctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(state.x, state.z);
    mctx.save();
    mctx.translate(px, py);
    mctx.rotate(state.heading);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7);
    mctx.lineTo(5, 6);
    mctx.lineTo(-5, 6);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
    // View cone: the camera direction, so the minimap reads like a radar.
    mctx.strokeStyle = 'rgba(255,255,255,0.35)';
    mctx.beginPath();
    mctx.moveTo(px, py);
    mctx.lineTo(px + Math.sin(state.heading) * 16, py + Math.cos(state.heading) * 16);
    mctx.stroke();
  }

  function setStars(wanted) {
    const stars = $('stars');
    stars.innerHTML = '';
    for (let i = 1; i <= 5; i += 1) {
      const star = document.createElement('span');
      star.textContent = '★';
      star.className = i <= wanted ? 'on' : '';
      stars.appendChild(star);
    }
  }

  function toast(message, ms = 4200) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    box.appendChild(el);
    window.setTimeout(() => el.remove(), ms);
  }

  function banner(title, sub, kind) {
    const el = $('banner');
    el.innerHTML = '';
    const t = document.createElement('div');
    t.className = `banner-title ${kind || ''}`;
    t.textContent = title;
    const s = document.createElement('div');
    s.className = 'banner-sub';
    s.textContent = sub || '';
    el.appendChild(t);
    el.appendChild(s);
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 3600);
  }

  function setScreen(name) {
    for (const id of ['screen-title', 'screen-pause', 'screen-over', 'screen-win']) {
      $(id).classList.toggle('hidden', id !== name);
    }
    $('hud').classList.toggle('hidden', name === 'screen-title');
    if (name) $('crosshair').classList.add('hidden');
  }

  function buildWheel() {
    const wheel = $('wheel');
    wheel.innerHTML = '';
    const slots = [
      { id: 'fists', label: 'FISTS', key: '1' },
      { id: 'pistol', label: 'PISTOL', key: '2' },
      { id: 'smg', label: 'SMG', key: '3' },
      { id: 'shotgun', label: 'SHOTGUN', key: '4' },
    ];
    for (const slot of slots) {
      const el = document.createElement('button');
      el.className = 'wheel-slot';
      el.dataset.weapon = slot.id;
      el.innerHTML = `<b>${slot.label}</b><span>[${slot.key}] ${WEAPONS[slot.id].damage} dmg</span>`;
      el.addEventListener('click', () => {
        wheelSelected = slot.id;
        callbacks.onSelectWeapon?.(slot.id);
      });
      wheel.appendChild(el);
    }
  }
  buildWheel();

  function showWheel(open) {
    wheelOpen = open;
    $('wheel').classList.toggle('hidden', !open);
  }

  return {
    update(state) {
      if (!$('hud').classList.contains('hidden')) {
        drawMinimap(state);
        $('district').textContent = state.district || 'Solstice City';
        setStars(state.wanted);
        $('wanted-label').textContent = state.wanted === 0 ? 'CLEAN' : `WANTED — LEVEL ${state.wanted}`;
        $('heat-fill').style.width = `${Math.min(100, (state.wanted / 5) * 100)}%`;
        $('heli-row').classList.toggle('hidden', !state.heli);
        if (state.heli) {
          $('heli-fill').style.width = `${Math.round(state.heliLock)}%`;
          $('heli-fill').style.background = state.heliLock > 70 ? '#ff3333' : '#ff8a00';
        }
        $('health-fill').style.width = `${Math.max(0, state.health)}%`;
        $('health-fill').style.background = state.health > 50 ? '#2ec27a' : state.health > 25 ? '#e8c33a' : '#ff3333';
        $('health-num').textContent = `${Math.max(0, Math.ceil(state.health))}`;
        $('money').textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
        const weapon = WEAPONS[state.weapon];
        const ammo = state.ammo;
        $('weapon-name').textContent = weapon.name.toUpperCase();
        $('weapon-ammo').textContent = weapon.name === 'Fists' ? '∞' : `${ammo.mag} / ${ammo.reserve}`;
        $('speed').textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 2.4)}` : '';
        $('speed-unit').textContent = state.inCar ? 'km/h' : '';
        $('radio').textContent = state.inCar ? RADIO[state.radio % RADIO.length].name : '';
        $('objective').textContent = state.objective || '';
        $('objective').classList.toggle('hidden', !state.objective);
        $('hint').textContent = state.hint || '';
        $('hint').classList.toggle('hidden', !state.hint);
        $('crosshair').classList.toggle('hidden', state.inCar || state.weapon === 'fists' || wheelOpen);
        document.querySelectorAll('.wheel-slot').forEach((el) => {
          el.classList.toggle('selected', el.dataset.weapon === state.weapon);
        });
      }
    },
    toast,
    banner,
    setScreen,
    showWheel,
    get wheelOpen() {
      return wheelOpen;
    },
    setTitleStats(save) {
      $('title-stats').textContent = `Missions done: ${save.missionsDone.length}/10 · Money: $${save.money} · Best wanted: ${'★'.repeat(save.bestWanted) || '—'}`;
      $('btn-continue').classList.toggle('hidden', save.missionsDone.length === 0 && save.money <= 250);
    },
    setGameOver(stats) {
      $('over-stats').textContent = stats;
    },
  };
}

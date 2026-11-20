// Solstice City v4 — save and continue. One localStorage slot; the run
// autosaves every twenty seconds and on every big event.

import { SAVE_KEY, MISSIONS } from './config.js';

export function saveGame(g) {
  try {
    const p = g.player;
    const data = {
      cash: p.cash,
      totalEarned: p.totalEarned,
      missionIndex: g.missions.index,
      missionStep: g.missions.step,
      missionName: g.missions.current() ? g.missions.current().name : 'Story complete',
      x: p.x,
      y: p.y,
      health: p.health,
      wanted: 0,
      time: g.time,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be unavailable (private mode); the game plays on.
  }
}

export function loadSaveData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function applySave(g, data) {
  const p = g.player;
  p.cash = data.cash || 0;
  p.totalEarned = data.totalEarned || 0;
  p.health = data.health ?? 100;
  p.wanted = 0;
  if (typeof data.x === 'number' && typeof data.y === 'number') {
    p.x = data.x;
    p.y = data.y;
    p.group.position.set(p.x, 0, p.y);
  }
  const index = Math.min(data.missionIndex || 0, MISSIONS.length - 1);
  g.missions.startMission(index);
  g.missions.step = data.missionStep || 0;
  g.missions.beginStage();
}

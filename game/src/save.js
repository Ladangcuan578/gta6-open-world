// Solstice City v3 — the save. One localStorage key holds the whole run:
// cash, earnings, the mission, the wanted level, health and where Rico
// stands. The menu offers Continue when a save exists; the game writes on
// every big event and every twenty seconds.

import { SAVE_KEY, AUTOSAVE_SECONDS } from './config.js';

export function saveGame(game) {
  try {
    const p = game.player;
    const data = {
      version: 1,
      cash: Math.round(p.cash),
      totalEarned: Math.round(p.totalEarned),
      missionIndex: game.missions.index,
      missionStep: game.missions.step,
      wanted: p.wanted,
      health: Math.round(p.health),
      x: Math.round(p.x),
      y: Math.round(p.y),
      track: game.sound.track,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage may be unavailable; the game still runs.
  }
}

// A tiny autosave clock the main loop ticks.
export class Autosave {
  constructor(game) {
    this.game = game;
    this.t = AUTOSAVE_SECONDS;
  }
  tick(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = AUTOSAVE_SECONDS;
      saveGame(this.game);
    }
  }
}

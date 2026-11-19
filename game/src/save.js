// Solstice City — saving to localStorage: cash, mission progress, where
// Rico is, and his health. A save is written on mission complete, on pause,
// every 20 seconds of play, and after being busted or wasted.
import { CFG } from './config.js';

export function saveGame(game) {
  try {
    const data = {
      v: 2,
      cash: game.player.cash,
      totalEarned: game.totalEarned || 0,
      missionIndex: game.missions.index,
      missionDone: game.missions.done,
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      health: Math.round(game.player.health),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || (data.v !== 1 && data.v !== 2)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(CFG.SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}

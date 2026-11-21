// Persistent storage: money, story progress, best wanted level and settings survive
// between visits in localStorage. Nothing leaves the browser.
import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    money: 250,
    missionsDone: [],
    bestWanted: 0,
    carsStolen: 0,
    kills: 0,
    radio: 0,
    quality: 'high',
    playSeconds: 0,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return { ...defaultSave(), ...parsed };
  } catch {
    return defaultSave();
  }
}

export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: the game then keeps progress for this visit only.
  }
}

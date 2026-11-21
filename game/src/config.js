// Solstice City — shared constants: world layout, dusk palette, physics, economy.
// Everything here is original: the city, names, colours and numbers are invented for
// this game and are not taken from any commercial game.
export const WORLD = {
  GRID: 10, // blocks per side
  BLOCK: 56, // metres of building block
  ROAD: 12, // metres of road between blocks
  get SIZE() {
    return this.GRID * this.BLOCK + (this.GRID + 1) * this.ROAD;
  },
  get HALF() {
    return this.SIZE / 2;
  },
};

// Road centrelines (x or z), from west/north edge to east/south edge.
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= WORLD.GRID; i += 1) {
    lines.push(-WORLD.HALF + WORLD.ROAD / 2 + i * (WORLD.BLOCK + WORLD.ROAD));
  }
  return lines;
}

// Block centre (bx, bz are 0..GRID-1) in world metres.
export function blockCentre(bx, bz) {
  return {
    x: -WORLD.HALF + WORLD.ROAD + WORLD.BLOCK / 2 + bx * (WORLD.BLOCK + WORLD.ROAD),
    z: -WORLD.HALF + WORLD.ROAD + WORLD.BLOCK / 2 + bz * (WORLD.BLOCK + WORLD.ROAD),
  };
}

// District of a block: drives building height, colour and props.
export function districtOf(bx, bz) {
  if (bx >= 4 && bx <= 5 && bz >= 7 && bz <= 8) return 'plaza';
  if (bx >= 1 && bx <= 2 && bz >= 1 && bz <= 2) return 'park';
  if (bx >= 8 && bz <= 1) return 'airfield';
  if (bx >= 8 && bz >= 2 && bz <= 5) return 'portside';
  if (bz === 9) return 'beach';
  if (bx >= 3 && bx <= 6 && bz >= 3 && bz <= 6) return 'downtown';
  if (bx <= 2 && bz >= 3 && bz <= 6) return 'oldtown';
  if (bz <= 2) return 'uptown';
  return 'midtown';
}

export const DISTRICT_STYLE = {
  downtown: { minH: 42, maxH: 95, hue: 0.62, lit: 0.55, sign: 0.5 },
  oldtown: { minH: 12, maxH: 26, hue: 0.07, lit: 0.5, sign: 0.35 },
  uptown: { minH: 20, maxH: 38, hue: 0.55, lit: 0.45, sign: 0.2 },
  portside: { minH: 9, maxH: 17, hue: 0.35, lit: 0.25, sign: 0.15 },
  beach: { minH: 8, maxH: 16, hue: 0.09, lit: 0.6, sign: 0.3 },
  park: { minH: 0, maxH: 0, hue: 0.33, lit: 0, sign: 0 },
  plaza: { minH: 0, maxH: 0, hue: 0.6, lit: 0, sign: 0.4 },
  airfield: { minH: 8, maxH: 14, hue: 0.5, lit: 0.3, sign: 0.1 },
  midtown: { minH: 16, maxH: 34, hue: 0.58, lit: 0.45, sign: 0.3 },
};

// Neon-sunset palette: the sun is low in the west, the sky goes purple to orange.
export const PALETTE = {
  skyTop: 0x2a1650,
  skyMid: 0x7a2d6e,
  skyLow: 0xff7a3c,
  sun: 0xffd27a,
  fog: 0x8a4a6b,
  ground: 0x3a3340,
  road: 0x2e2a33,
  sidewalk: 0x6f6a72,
  water: 0x1d4e6e,
  sand: 0xd9b380,
  grass: 0x3f7a44,
  windowLit: 0xffd27a,
  windowDark: 0x2c3550,
  neon: [0xff2e88, 0x00e5ff, 0xffd21f, 0x7dff2e, 0xff6a00, 0xb44dff],
};

export const PHYSICS = {
  walkSpeed: 5.2,
  runSpeed: 8.5,
  carAccel: 16,
  carBrake: 30,
  carReverse: 9,
  carMaxSpeed: 46,
  carTurn: 1.9,
  carGrip: 0.86,
  copAccel: 15,
  copMaxSpeed: 42,
  heliSpeed: 26,
  heliHeight: 55,
};

export const WANTED = {
  // stars -> { cruisers, roadblocks, heli }
  0: { cruisers: 0, roadblocks: 0, heli: false },
  1: { cruisers: 1, roadblocks: 0, heli: false },
  2: { cruisers: 2, roadblocks: 0, heli: false },
  3: { cruisers: 3, roadblocks: 1, heli: false },
  4: { cruisers: 4, roadblocks: 2, heli: true },
  5: { cruisers: 5, roadblocks: 3, heli: true },
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.45, range: 2.2, ammo: Infinity, mag: Infinity, auto: false, spread: 0 },
  pistol: { name: 'P9 Pistol', damage: 26, rate: 0.32, range: 60, ammo: 96, mag: 12, auto: false, spread: 0.012 },
  smg: { name: 'K9 SMG', damage: 15, rate: 0.09, range: 45, ammo: 180, mag: 30, auto: true, spread: 0.05 },
  shotgun: { name: ' Riot-12', damage: 16, rate: 0.85, range: 28, ammo: 36, mag: 6, auto: false, spread: 0.11, pellets: 7 },
};

export const RADIO = [
  { id: 'sunset', name: 'SUNSET FM 88.1', tag: 'synthwave drive' },
  { id: 'bay', name: 'BAY TALK 102.4', tag: 'talk & traffic' },
  { id: 'neon', name: 'NEON NIGHTS 95.5', tag: 'late-night funk' },
];

export const SAVE_KEY = 'solstice-city-save-v5';
export const BEST_KEY = 'solstice-city-best-v5';

// Solstice City v3 — configuration: the world, its districts, the story, the radio.
// Everything here is original to this entry: an invented coastal city, an
// invented cast, invented music. Nothing is taken from any real game.

export const SAVE_KEY = 'solstice-city-save-v1';

// The logic world is a flat 2D plane measured in pixels. The renderer maps
// logic (x, y) to 3D (x - HALF, 0, y - HALF), so north (-y) is -Z in three.js.
export const WORLD = 2400;
export const HALF = WORLD / 2;
export const PITCH = 200; // block pitch: one block + one road
export const ROAD = 40; // road width
export const BLOCK = PITCH - ROAD; // building block size

// Movement and driving, in pixels per second.
export const WALK_SPEED = 150;
export const CAR_ACCEL = 260;
export const CAR_BRAKE = 420;
export const CAR_REVERSE_MAX = 130;
export const CAR_MAX_SPEED = 520;
export const SPORT_MAX_SPEED = 600;
export const TRUCK_MAX_SPEED = 380;
export const TRAFFIC_SPEED = 115;
export const POLICE_SPEED = 570;
export const PED_SPEED = 42;
export const PED_FLEE_SPEED = 95;

export const STASH_COUNT = 8;
export const STASH_VALUE = 100;
export const STASH_RESPAWN = 60; // seconds until a picked stash comes back
export const TAXI_FARE_MIN = 150;
export const TAXI_FARE_MAX = 300;
export const AUTOSAVE_SECONDS = 20;

// Wanted: how many police the level fields, and when the roadblocks arrive.
export const POLICE_PER_WANTED = (w) => (w >= 2 ? Math.min(6, w + 1) : 0);
export const ROADBLOCK_WANTED = 4;
export const HELI_WANTED = 4;
export const WANTED_DECAY_SECONDS = 30;

// The dusk never moves: the sun hangs low in the west all game.
export const DUSK = {
  skyTop: '#2b1155',
  skyMid: '#a03a7d',
  skyLow: '#ff7a3c',
  fog: 0xd98aa8,
  fogNear: 260,
  fogFar: 1750,
  sunColor: 0xffb36b,
  sunIntensity: 2.1,
  ambient: 0x8a6bb0,
  ambientIntensity: 0.75,
  hemiSky: 0x9a6bb8,
  hemiGround: 0x3a2a33,
  hemiIntensity: 0.5,
};

// Districts by block column/row (0..11). The city reads as a place, not a grid
// of identical boxes: heights, tints and uses change by quarter.
export function districtAt(i, j) {
  if (i === 0 && j <= 5) return { name: 'Airstrip', h: [0, 0], tint: 0x8a8f96, use: 'runway' };
  if (i >= 2 && i <= 3 && j >= 4 && j <= 5) return { name: 'Palm Park', h: [0, 0], tint: 0x3f7a4a, use: 'park' };
  if (i >= 5 && i <= 6 && j >= 5 && j <= 6) return { name: 'Solstice Plaza', h: [0, 0], tint: 0xb09a72, use: 'plaza' };
  if (i >= 4 && i <= 7 && j >= 4 && j <= 7) return { name: 'Downtown', h: [70, 150], tint: 0x6a6f85, use: 'tower' };
  if (i >= 8 && j <= 3) return { name: 'Uptown', h: [30, 70], tint: 0x7a6a72, use: 'flats' };
  if (i <= 3 && j >= 8) return { name: 'Portside', h: [18, 38], tint: 0x6b5a4a, use: 'warehouse' };
  if (i >= 8 && j >= 8) return { name: 'Beachfront', h: [14, 32], tint: 0xc2a878, use: 'villa' };
  if (i >= 4 && i <= 7 && j <= 3) return { name: 'Old Town', h: [22, 48], tint: 0x8a5f4a, use: 'brick' };
  return { name: 'Marina Row', h: [24, 55], tint: 0x5f6a7a, use: 'mid' };
}

// Neon signs that hang on downtown and beachfront facades. All invented words.
export const NEON_SIGNS = ['HOTEL', 'BAR', 'TACOS', 'NEON', 'CASINO', '24H'];
export const NEON_COLORS = ['#ff5ad2', '#37e6ff', '#ffb13c', '#7dff5a', '#ff4d4d', '#c97bff'];

// Landmarks: every story target sits on a road or an open square, never
// inside a building, so a car can always reach it.
export const LANDMARKS = {
  garage: { name: "Rico's Garage", x: 1300, y: 1420, w: 160, h: 160, arrival: { x: 1300, y: 1600 } },
  pier: { name: 'Pier Boardwalk', arrival: { x: 2260, y: 1200 } },
  airport: { name: 'Solstice Airfield', arrival: { x: 400, y: 500 } },
  casino: { name: 'Casino Neon', arrival: { x: 1620, y: 1100 } },
  hotel: { name: 'Hotel Miramar', arrival: { x: 2020, y: 1900 } },
  plaza: { name: 'Solstice Plaza', arrival: { x: 1200, y: 1180 } },
  bank: { name: 'First Solstice Bank', arrival: { x: 1200, y: 900 } },
  safehouse: { name: 'Portside Safehouse', arrival: { x: 620, y: 1900 } },
  beach: { name: 'Beach Boardwalk', arrival: { x: 2260, y: 1600 } },
};

// The player starts on the road south of the garage, facing north toward it.
export const SPAWN = { x: 1150, y: 1600, angle: 0 };

// Cash stashes, all on road centrelines so they are always reachable.
export const STASH_SPOTS = [
  { x: 200, y: 200 }, { x: 600, y: 1000 }, { x: 1400, y: 200 }, { x: 2200, y: 600 },
  { x: 400, y: 1600 }, { x: 1800, y: 1800 }, { x: 1000, y: 2200 }, { x: 2200, y: 1400 },
];

// Reputation titles by lifetime earnings.
export const TITLES = [
  { at: 0, name: 'Wheelman' },
  { at: 1500, name: 'Street Boss' },
  { at: 5000, name: 'King of Solstice' },
  { at: 10000, name: 'Legend of Solstice' },
];
export function titleFor(earned) {
  let t = TITLES[0].name;
  for (const row of TITLES) if (earned >= row.at) t = row.name;
  return t;
}

// The story: seven jobs from Vera Solano. Each step is a kind of job — steal
// a car, go to a place, or deliver against the clock — with its own target.
export const MISSIONS = [
  {
    name: 'First Wheels', pay: 500,
    intro: 'Vera: Rico, you need wheels before anything else. Take any car on the street — just make it quick.',
    outro: 'Vera: Not bad. The garage is yours now. One job down, six to go.',
    steps: [
      { kind: 'steal', text: 'Steal a car — any ride will do' },
      { kind: 'goto', text: 'Drive it to Rico\u2019s Garage', target: LANDMARKS.garage.arrival },
    ],
  },
  {
    name: 'Hot Delivery', pay: 800,
    intro: 'Vera: A package is waiting at the garage. The pier crowd pays double if it arrives before the clock runs out.',
    outro: 'Vera: Delivered hot. The boardwalk boys are already asking for you by name.',
    steps: [
      { kind: 'goto', text: 'Pick up the package at the garage', target: LANDMARKS.garage.arrival },
      { kind: 'deliver', text: 'Deliver to the Pier Boardwalk', target: LANDMARKS.pier.arrival, time: 120 },
    ],
  },
  {
    name: 'The Pickup', pay: 1200,
    intro: 'Vera: My contact is waiting by the plaza fountain. He does not like waiting. Get him to the airfield in one piece.',
    outro: 'Vera: He made his flight. That is how you build a name in this city.',
    steps: [
      { kind: 'goto', text: 'Meet Vera\u2019s contact at the Plaza', target: LANDMARKS.plaza.arrival },
      { kind: 'deliver', text: 'Drive him to Solstice Airfield', target: LANDMARKS.airport.arrival, time: 150 },
    ],
  },
  {
    name: 'The Big One', pay: 3000,
    intro: 'Vera: The Casino Neon keeps its night cash in a back room. Take it, then vanish to the Portside safehouse before the whole city wakes up.',
    outro: 'Vera: Three thousand, clean. You are not a wheelman anymore, Rico.',
    steps: [
      { kind: 'goto', text: 'Grab the night cash at Casino Neon', target: LANDMARKS.casino.arrival },
      { kind: 'deliver', text: 'Escape to the Portside Safehouse', target: LANDMARKS.safehouse.arrival, time: 180 },
    ],
  },
  {
    name: 'Airport Run', pay: 2000,
    intro: 'Vera: A briefcase lands at the airfield in ten minutes. The hotel wants it more than the airport does.',
    outro: 'Vera: The hotel paid without counting. That is the kind of client we keep.',
    steps: [
      { kind: 'goto', text: 'Pick up the briefcase at the Airfield', target: LANDMARKS.airport.arrival },
      { kind: 'deliver', text: 'Deliver to Hotel Miramar', target: LANDMARKS.hotel.arrival, time: 150 },
    ],
  },
  {
    name: 'The Long Con', pay: 2500,
    intro: 'Vera: The casino keeps a ledger of everyone it owns. Photograph it — with your eyes, not a camera — and bring the numbers to me at the plaza.',
    outro: 'Vera: With this ledger, the Neon pays us now. Beautiful work.',
    steps: [
      { kind: 'goto', text: 'Read the ledger at Casino Neon', target: LANDMARKS.casino.arrival },
      { kind: 'goto', text: 'Bring the numbers to Vera at the Plaza', target: LANDMARKS.plaza.arrival },
    ],
  },
  {
    name: 'The Last Score', pay: 4000,
    intro: 'Vera: First Solstice Bank. One vault, one driver, one way out — the beach. After this, Rico, we are legends or we are nothing.',
    outro: 'Vera: Four thousand. The city is ours now, Rico. Solstice City, king of the coast.',
    steps: [
      { kind: 'goto', text: 'Reach First Solstice Bank', target: LANDMARKS.bank.arrival },
      { kind: 'deliver', text: 'Escape to the Beach Boardwalk', target: LANDMARKS.beach.arrival, time: 180 },
    ],
  },
];

// Solstice FM 88.1 — invented tracks, all synthesized live, no audio files.
export const TRACKS = [
  { title: 'Neon Coast Drive', bpm: 96, root: 55, minor: true },
  { title: 'Palms at Midnight', bpm: 82, root: 49, minor: true },
  { title: 'Sunset Overdrive', bpm: 112, root: 62, minor: false },
];

// Traffic-light intersections: the 8-second cycle alternates the avenues.
export const LIGHT_CYCLE = 8;
export const LIGHT_POINTS = [
  { x: 1000, y: 1000 }, { x: 1400, y: 1000 }, { x: 1000, y: 1400 }, { x: 1400, y: 1400 },
  { x: 600, y: 600 }, { x: 1800, y: 600 }, { x: 600, y: 1800 }, { x: 1800, y: 1800 },
];
export function lightIsGreen(t, axis) {
  const phase = t % LIGHT_CYCLE;
  return axis === 'ns' ? phase < 4 : phase >= 4;
}

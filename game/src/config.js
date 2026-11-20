// Solstice City v4 — tuning, palette, world layout and story data.
// Every number and line here was written fresh for this entry.

export const WORLD = {
  BLOCK: 240, // building block side, in world units
  ROAD: 64, // road width
  PITCH: 304, // block + road
  HALF: 1856, // city extends -HALF..HALF on both axes
  GRID: 12, // 12x12 blocks
};

// Dusk palette: a neon sunset over a coastal city.
export const PALETTE = {
  skyTop: 0x2a1650,
  skyMid: 0xc94b7c,
  skyLow: 0xff8c42,
  fog: 0xe58aa5,
  sun: 0xffd27a,
  sunCore: 0xfff3c4,
  road: 0x2b2b33,
  roadLine: 0xd8c86a,
  sidewalk: 0x4a4a52,
  curb: 0x6a6a72,
  sand: 0xd9a86c,
  water: 0x1e4d6b,
  waterGlow: 0x2f7ea8,
  grass: 0x2e5d3a,
  plazaStone: 0x8a7f8c,
  runway: 0x3a3a42,
  buildingGlass: 0x2c3e55,
  neon: [0xff2d78, 0x00e5ff, 0xffd21f, 0x7cff2d, 0xff7a1f, 0xc44dff],
};

export const SPEED = {
  walk: 150,
  sedanTop: 265,
  sportTop: 330,
  taxiTop: 250,
  policeTop: 295,
  trafficCruise: 105,
  accel: 210,
  brake: 320,
  reverseTop: 90,
  turnRate: 2.4,
  bullet: 950,
  heli: 170,
};

export const WANTED = {
  stealCar: 1,
  stealPoliceCar: 2,
  shootCop: 1,
  hitPed: 1,
  max: 5,
  policePerStar: 1,
  policeBase: 3,
  policeMax: 6,
  roadblockAt: 4,
  heliAt: 4,
  decaySeconds: 30,
};

// Landmarks: fixed points the story and the play-test rely on.
// Coordinates are world units; roads run at multiples of WORLD.PITCH.
export const LANDMARKS = {
  spawn: { x: -160, y: 304 },
  garage: {
    building: { x: 336, y: 40, w: 200, h: 160 },
    arrival: { x: 436, y: 304 },
  },
  hotel: {
    building: { x: 640, y: -272, w: 200, h: 160 },
    arrival: { x: 740, y: 0 },
  },
  plaza: { fountain: { x: -152, y: -456 }, arrival: { x: -152, y: -456 } },
  bank: {
    building: { x: 944, y: 336, w: 220, h: 180 },
    arrival: { x: 1054, y: 608 },
  },
  airport: { runway: { x: 1520, y: 912 }, arrival: { x: 1520, y: 912 } },
  port: {
    building: { x: -1184, y: 640, w: 200, h: 160 },
    arrival: { x: -1084, y: 912 },
  },
  casino: {
    building: { x: 336, y: -880, w: 220, h: 180 },
    arrival: { x: 446, y: -608 },
  },
  oldtown: { point: { x: -760, y: -152 }, arrival: { x: -760, y: -152 } },
  boardwalk: { point: { x: 0, y: 1880 }, arrival: { x: 0, y: 1880 } },
};

// The seven story jobs. Each stage has an objective line, a target point
// (as a landmark key), a radius, and an optional countdown in seconds.
// Dialogue is Vera Solano talking to Rico over the phone.
export const MISSIONS = [
  {
    name: 'First Wheels',
    pay: 500,
    intro: 'Rico, sayang. Butuh roda cepat. Curi mobil apa saja di jalan, lalu bawa ke garasi gue.',
    stages: [
      { objective: 'Steal any car on the street', target: null, radius: 0 },
      { objective: 'Drive to Vera\u2019s garage', target: 'garage', radius: 70 },
    ],
    done: 'Bagus. Mobil pertama selalu yang paling manis. $500 buat kamu.',
  },
  {
    name: 'Hot Delivery',
    pay: 800,
    intro: 'Ada paket panas di garasi. Ambil, lalu antar ke Palms Hotel sebelum dingin.',
    stages: [
      { objective: 'Pick up the package at the garage', target: 'garage', radius: 70 },
      { objective: 'Deliver to the Palms Hotel', target: 'hotel', radius: 70, timer: 75 },
    ],
    done: 'Tepat waktu. Hotel suka kurir yang tidak bertanya. $800.',
  },
  {
    name: 'The Pickup',
    pay: 1200,
    intro: 'Milo nunggu di air mancur plaza. Jemput dia, antar ke landasan pacu. Jangan bikin dia mabuk.',
    stages: [
      { objective: 'Pick up Milo at the plaza fountain', target: 'plaza', radius: 60 },
      { objective: 'Drop Milo at the airfield runway', target: 'airport', radius: 80, timer: 90 },
    ],
    done: 'Milo sampai dengan utuh. $1,200. Dia bilang kamu nyetir kayak nenek, tapi aman.',
  },
  {
    name: 'The Big One',
    pay: 3000,
    intro: 'Bank Nasional Solstice. Masuk, ambil, keluar. Lalu hilang ke boardwalk sebelum sirene datang.',
    stages: [
      { objective: 'Reach the Solstice National Bank', target: 'bank', radius: 70 },
      { objective: 'Grab the cash and reach the boardwalk', target: 'boardwalk', radius: 80, timer: 100 },
    ],
    done: '$3,000. Banknya tidak akan merindukan uang itu. Kamu resmi naik kelas.',
  },
  {
    name: 'Airport Run',
    pay: 2000,
    intro: 'Kurir mendarat di landasan. Temui dia, bawa barangnya ke gudang pelabuhan.',
    stages: [
      { objective: 'Meet the courier on the runway', target: 'airport', radius: 80 },
      { objective: 'Deliver to the port warehouse', target: 'port', radius: 70, timer: 90 },
    ],
    done: 'Beres. $2,000. Kurirnya bilang lain kali bawa kopi.',
  },
  {
    name: 'The Long Con',
    pay: 2500,
    intro: 'Tiga pemberhentian, satu koper. Old Town, kasino, lalu plaza. Jangan sampai ketahuan.',
    stages: [
      { objective: 'Collect the briefcase in Old Town', target: 'oldtown', radius: 60 },
      { objective: 'Drop it at the casino', target: 'casino', radius: 70 },
      { objective: 'Lose the tail — reach the plaza', target: 'plaza', radius: 60, timer: 120 },
    ],
    done: '$2,500. Tiga pemberhentian, nol pertanyaan. Kamu memang licin, Rico.',
  },
  {
    name: 'The Last Score',
    pay: 4000,
    intro: 'Ini yang terakhir, Rico. Bank yang sama, taruhan lebih besar. Habis ini kita pensiun dari permainan ini.',
    stages: [
      { objective: 'Hit the bank one last time', target: 'bank', radius: 70 },
      { objective: 'Escape to the boardwalk', target: 'boardwalk', radius: 80, timer: 110 },
    ],
    done: '$4,000. Cerita selesai, legenda dimulai. Solstice City milikmu sekarang.',
  },
];

export const REPUTATION = [
  { at: 0, title: 'Wheelman' },
  { at: 1000, title: 'Street Boss' },
  { at: 4000, title: 'King of Solstice' },
  { at: 8000, title: 'Legend of Solstice' },
];

// Solstice FM 88.1 — four invented synthwave tracks, all synthesized live.
export const RADIO = [
  { name: 'Sunset Run — The Palms', bpm: 96, root: 45, bright: false },
  { name: 'Neon Coast — Vera Lights', bpm: 112, root: 43, bright: true },
  { name: 'Midnight Boardwalk — Coral Keys', bpm: 88, root: 48, bright: false },
  { name: 'Heat Haze — Downtown Heat', bpm: 122, root: 41, bright: true },
];

export const NEON_SIGNS = ['HOTEL', 'BAR', 'TACOS', 'NEON', 'CASINO', '24H'];

export const TAXI_FARE = { min: 150, max: 300 };
export const STASH_VALUE = 100;
export const STASH_COUNT = 8;
export const STASH_RESPAWN = 60;
export const AUTOSAVE_SECONDS = 20;
export const SAVE_KEY = 'solstice-city-save-v1';

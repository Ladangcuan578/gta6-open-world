// Solstice City — tuning constants and the shared palette.
// One place for every number that shapes how the city plays and looks.

export const CFG = {
  // World geometry (pixels).
  PITCH: 272, // block (200) + road (72)
  BLOCK: 200,
  ROAD: 72,
  GRID: 12, // blocks per side
  // World spans 0 .. GRID*PITCH; the bay sits south of it.
  BAY: 420, // water strip depth south of the city
  BEACH: 46, // sand strip between the last road and the water

  // Player.
  WALK_SPEED: 195,
  SPRINT_SPEED: 300,
  PLAYER_RADIUS: 13,
  PLAYER_HEALTH: 100,

  // Cars.
  CAR_LENGTH: 48,
  CAR_WIDTH: 24,
  CAR_TYPES: {
    sedan: { accel: 340, maxSpeed: 430, reverse: 170, grip: 2.6, health: 100 },
    sport: { accel: 430, maxSpeed: 570, reverse: 180, grip: 2.2, health: 90 },
    truck: { accel: 260, maxSpeed: 360, reverse: 150, grip: 3.0, health: 160 },
    van: { accel: 300, maxSpeed: 400, reverse: 160, grip: 2.8, health: 170 },
    taxi: { accel: 320, maxSpeed: 420, reverse: 160, grip: 2.7, health: 110 },
    police: { accel: 460, maxSpeed: 540, reverse: 190, grip: 2.4, health: 130 },
  },

  // Traffic and pedestrians.
  TRAFFIC_COUNT: 16,
  PED_COUNT: 26,
  TRAFFIC_SPEED: [95, 150],

  // Wanted.
  WANTED_MAX: 5,
  WANTED_DECAY_IDLE: 12, // seconds without a crime before it starts to fall
  WANTED_DECAY_STEP: 6, // seconds per star lost while cooling down
  POLICE_MAX: 4,
  HELI_WANTED: 4, // a police helicopter joins the chase from 4 stars up

  // Sunset: the sun hangs low and the lamps come on.
  SUNSET: {
    sunColor: 0xff8c3a,
    sunIntensity: 2.3,
    sunHeight: 260, // low sun, long shadows
    sunDistance: 1038,
    skyTop: '#2a1745', // deep dusk purple
    skyMid: '#b83a6e', // neon magenta
    skyLow: '#ff9a3c', // sunset orange at the horizon
    fogColor: 0xc96a6a,
    fogNear: 1500,
    fogFar: 3600,
    hemiSky: 0x9a6bb8,
    hemiGround: 0x4a3428,
    hemiIntensity: 0.75,
    exposure: 1.12,
  },
  TRAFFIC_LIGHT_CYCLE: 8, // seconds of green before the lights flip
  HEADLIGHT_RANGE: 700,

  // Combat.
  BULLET_SPEED: 1050,
  BULLET_RANGE: 640,
  BULLET_DAMAGE_CAR: 26,
  BULLET_DAMAGE_PED: 60,
  FIRE_COOLDOWN: 0.16,

  // Missions.
  MISSION_REWARDS: [500, 800, 1200, 3000, 2000, 2500, 4000],

  // Side activities.
  FARE_REWARD: [150, 300],
  STASH_REWARD: 100,
  STASH_COUNT: 8,

  // Save.
  SAVE_KEY: 'solstice-city-save-v1',
};

// Neon sunset palette: warm dusk asphalt, magenta sky, glowing windows.
export const PAL = {
  asphalt: '#2e3138',
  asphaltDark: '#26292f',
  roadLine: '#e8c85a',
  sidewalk: '#a08a68',
  sidewalkEdge: '#8a7554',
  curb: '#77663f',
  grass: '#6a9a50',
  grassDark: '#557f3e',
  sand: '#d9b47e',
  water: '#2a6a94',
  waterDeep: '#1e4f70',
  parkPath: '#c9a87e',
  buildingShadow: 'rgba(10, 6, 16, 0.35)',
  roofs: ['#8a4a36', '#9a6a42', '#5a6a66', '#7a8266', '#8a7442', '#6a4a5e', '#5e686f', '#96584a'],
  walls: ['#e0c9a8', '#d4b89a', '#c4c4a8', '#d8b892', '#b8c4c4'],
  // Neon sign colours for the sunset strip.
  neon: ['#ff2e88', '#00e5ff', '#ffd23e', '#ff7a1a', '#7a4dff', '#3aff8a'],
  carColors: ['#c23b2e', '#2e6fc2', '#e8b73a', '#3aa655', '#e8e4da', '#7a4a9e', '#22262e', '#d97b2e'],
  playerJacket: '#e8590c',
  policeWhite: '#eef1f4',
  policeBlack: '#1d2126',
};

// The radio: one station, five tracks, cycled by the clock so the strip
// always names a song. All artists and titles are invented for this game.
export const RADIO = {
  station: 'SOLSTICE FM 88.1',
  tracks: [
    'Neon Coast — Sunset Drive',
    'Palm Static — Midnight Marina',
    'The Breakers — Golden Hour',
    'Vera Blue — Airstrip Lights',
    'Low Tide — Coral Static',
  ],
};

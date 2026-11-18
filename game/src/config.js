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

  // Combat.
  BULLET_SPEED: 1050,
  BULLET_RANGE: 640,
  BULLET_DAMAGE_CAR: 26,
  BULLET_DAMAGE_PED: 60,
  FIRE_COOLDOWN: 0.16,

  // Missions.
  MISSION_REWARDS: [500, 800, 1200, 3000, 2000],

  // Side activities.
  FARE_REWARD: [150, 300],
  STASH_REWARD: 100,
  STASH_COUNT: 8,

  // Save.
  SAVE_KEY: 'solstice-city-save-v1',
};

// Sun-soaked palette: warm asphalt, pastel roofs, green parks, blue bay.
export const PAL = {
  asphalt: '#3d414c',
  asphaltDark: '#34383f',
  roadLine: '#e8c85a',
  sidewalk: '#c2ab7f',
  sidewalkEdge: '#a98f63',
  curb: '#8f7a52',
  grass: '#79a854',
  grassDark: '#6a9a48',
  sand: '#e6cf9a',
  water: '#2f7fa8',
  waterDeep: '#256b90',
  parkPath: '#d8c49a',
  buildingShadow: 'rgba(20, 16, 10, 0.28)',
  roofs: ['#c96f4a', '#d9a05b', '#7fa8a0', '#b7c4a8', '#c9b458', '#a06a8a', '#8a9ab0', '#d98a7a'],
  walls: ['#e8dcc8', '#dccbb2', '#cfd6c2', '#e3cfae', '#c9d4de'],
  carColors: ['#c23b2e', '#2e6fc2', '#e8b73a', '#3aa655', '#e8e4da', '#7a4a9e', '#22262e', '#d97b2e'],
  playerJacket: '#e8590c',
  policeWhite: '#eef1f4',
  policeBlack: '#1d2126',
};

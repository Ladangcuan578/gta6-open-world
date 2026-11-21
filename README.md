[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Ladangcuan578/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Ladangcuan578/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solstice City — an open-world crime game

[Make GTA 6 on make.fun](https://make.fun/bounty/gta6-01)

Solstice City is an original 3D open-world crime game in a neon-sunset coastal city. You play Dante Vega, a driver-for-hire who owes $50,000 to Eddie Voss of the Solstice Kings. The fixer Mara Quinn has ten story jobs for you — stealing a first car, running hot deliveries, tailing a courier, hitting the bank twice, raiding a warehouse, rescuing an informant, and one last score at the airfield — while the Solstice City Police Department answers with cruisers, roadblocks and a helicopter with a searchlight. The city, the people, the music and the story are all invented. It is not affiliated with Rockstar Games.

## What is in the game

- **A city to explore** — a 10×10-block grid with its own districts: Downtown towers, Old Town brick, Uptown flats, Portside warehouses, Beachfront villas, Palm Park, Solstice Plaza, an airfield with a runway, and a boardwalk over the bay. The sun sits low in the west and throws long shadows; windows glow warm; neon signs spell HOTEL, BAR, TACOS, NEON, CASINO and 24H; traffic lights run a 16-second cycle and street lights pool warm light on the roads.
- **On foot and by car** — walk the sidewalks or steal any car on the street. Cars are built in detail: stepped hoods and trunks, bumpers, mirrors, front wheels that turn, a taxi with a roof sign, headlights with a real spotlight and a pool of light on the road (L), taillights and a sport spoiler. A low third-person chase camera follows the car and widens its field of view as you go faster.
- **Traffic and pedestrians** — 26 cars drive the grid, stop at red lights and slow for the car ahead; 8 more sit parked at the kerb, ready to steal. 42 pedestrians walk the sidewalks and flee when shots ring out.
- **A wanted system and police** — five stars. Cruisers pursue and ram, roadblocks appear from three stars, and from four stars a helicopter joins with a searchlight and a lock meter. Break its line of sight beside tall buildings and the lock decays; shoot it down and it retreats. Get caught on foot and you are busted; get shot and you are wasted. Either way you lose some cash and wake up at the Plaza.
- **Ten story missions** — a full arc with briefings, objectives, timers, tailing, shootouts and getaways, each paying out in cash. Progress, money and your best wanted level are saved in the browser.
- **Combat and a weapon wheel** — fists, pistol, SMG and shotgun (hold Q, or press 1–4), with tracers, muzzle flash, ammo and reloads. Guards and gang members shoot back.
- **A rich HUD** — a live minimap with traffic, police, helicopter and mission blips, wanted stars, the SCPD panel with a heli-lock meter, health, money, weapon and ammo, a speedometer and three procedural radio stations (M to change station).
- **Sound, all synthesised** — engine hum that follows your speed, a two-tone siren, gunshots, pickups and mission jingles, plus radio loops. No audio files.

## Controls

WASD / arrows — drive & walk · E — steal / enter / exit car · Q — weapon wheel · Mouse click or Space — shoot on foot · Shift — run / nitro · L — headlights · M — radio · C — reset camera · N — next job · P / Esc — pause

## How to run

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network request: the game is static files under `game/`, with three.js vendored at `game/vendor/three.module.min.js`.

## Screenshots

The four screenshots under `screenshots/` are real renders of the game, staged deterministically with `?shot=chase|drive|mission|foot&seed=7` (see `game/src/shots.js` and `tools/capture.mjs`). The cover, `1-chase.jpg`, shows a four-star chase with the helicopter, the wanted level, the minimap and a mission objective at once.

## Structure

- `game/index.html` — canvas and HUD
- `game/src/main.js` — boot, loop, chase camera, screens
- `game/src/city.js` — the procedural neon-sunset city
- `game/src/vehicles.js` — car models, driving physics, traffic
- `game/src/player.js` — Dante on foot
- `game/src/police.js` — cruisers, roadblocks, helicopter
- `game/src/pedestrians.js` — sidewalk life
- `game/src/missions.js` — the ten story jobs
- `game/src/combat.js` — weapons, shooting, enemies
- `game/src/hud.js` — minimap, wanted stars, SCPD panel, weapon wheel
- `game/src/audio.js` — synthesised sound and radio
- `game/src/shots.js` — deterministic screenshot scenes
- `game/src/config.js`, `game/src/rng.js`, `game/src/input.js`, `game/src/save.js` — constants, seeded random, input, saves

## License

MIT — see `LICENSE`.

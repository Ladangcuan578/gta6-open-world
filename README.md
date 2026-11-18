# Solstice City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Ladangcuan578/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Ladangcuan578/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game in the spirit of GTA 6, built for make.fun's **"Make GTA 6"** bounty. It plays offline in a desktop browser from static files — no network, no downloads, no build step.

## The story

Rico Marín owes money to Vera Solano, the fixer who runs sun-soaked **Solstice City** from her garage. Five missions stand between Rico and a clean slate: steal a car, run a hot delivery across town, pick up three stashes of cash, stop the bank courier van and lose a three-star wanted level, and finally drive Vera to the airstrip while the whole city hunts her. Everything — the city, the people, the cars, the story — is original.

## What is in the game

- **A 3D city to explore on foot and by car** — a seeded 12×12-block grid rendered in three.js (vendored locally, no network): roads, sidewalks, parks, a plaza, an airstrip, a beach and a bay, with windowed buildings, trees, streetlights, sun and shadows.
- **Traffic and pedestrians** — cars follow the road network in their lanes and stop for each other; pedestrians walk the sidewalks and run when a gun goes off or a car screams past.
- **Cars to steal** — walk up to any car, press E, and it is yours. The driver bails out and the cops notice.
- **A wanted level and police** — stars rise for stealing, hitting pedestrians, shooting, and ramming police. Police cars spawn, chase, and ram; at four stars they throw a roadblock across the road ahead. Get caught on foot and you are busted.
- **Missions and a story** — five missions with briefings, markers, timers, and cash rewards, plus a story ending.
- **Side activities and progression** — taxi fares (pick up a pedestrian and beat the clock), cash stashes hidden around the city, and a reputation title that grows with lifetime earnings: Wheelman, Street Boss, King of Solstice, Legend of Solstice.
- **Combat** — aim with the mouse and shoot on foot or from a car; cars take damage, smoke, and blow up, with muzzle flashes, sparks, and skid marks.
- **A HUD with a minimap** — cash, reputation, health, wanted stars, the current objective, speed, the time of day, and a live minimap with the player, police, mission marker, fares, and stashes.
- **Start, pause, and save** — a title screen with New Game / Continue, a pause menu, busted/wasted screens, and automatic saving to localStorage.
- **Sound** — engine hum, police sirens, gunshots, crashes, and jingles, all synthesized with WebAudio.

## Controls

| Input | Action |
| --- | --- |
| WASD / Arrows | Walk / drive |
| E | Enter or exit a car (steal it) |
| Mouse + Click | Aim and shoot |
| Shift | Sprint on foot / handbrake in a car |
| P or Esc | Pause |
| M | Sound on/off |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## How it is built

`game/` is plain static files. `game/src/` is split by job so each file does one thing:

- `config.js` — tuning numbers and the palette
- `random.js` — the seeded generator (same seed, same city)
- `input.js` — keyboard and mouse
- `audio.js` — WebAudio sound effects
- `city.js` — the city: blocks, roads, parks, beach, bay, collisions
- `vehicles.js` — car physics, traffic AI, police AI
- `pedestrians.js` — pedestrians and fleeing
- `player.js` — Rico: walking, driving, shooting, wanted
- `missions.js` — the five story missions
- `render.js` — the three.js renderer: camera, sun and shadows, buildings, trees, cars, people, markers, effects
- `hud.js` — HUD, minimap, menus, reputation
- `save.js` — localStorage saving
- `shots.js` — the deterministic screenshot scenes
- `main.js` — boot and the game loop

Screenshots are real renders of the game's own code, staged by `?shot=drive|chase|mission|foot|start&seed=1`.

## License

MIT. See [LICENSE](LICENSE).

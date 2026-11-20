[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Ladangcuan578/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Ladangcuan578/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solstice City — an open-world crime game

[Make GTA 6 on make.fun](https://make.fun/bounty/gta6-01)

Solstice City is an original 3D open-world crime game in a neon-sunset
coastal city. You play Rico Marín, a wheelman doing seven jobs for the fixer
Vera Solano — stealing a first car, running hot deliveries, hitting the bank
twice — while the Solstice City Police Department answers with cruisers,
roadblocks and a helicopter. The city, the people, the music and the story
are all invented. It is not affiliated with Rockstar Games.

## What is in the game

- **A city to explore** — a 12×12-block grid with its own districts: Downtown
  towers, Old Town brick, Uptown flats, Portside warehouses, Beachfront
  villas, Palm Park, Solstice Plaza, an airfield with a runway, and a
  boardwalk over the bay. The sun sits low in the west and throws long
  shadows; about a third of the windows glow warm; neon signs spell HOTEL,
  BAR, TACOS, NEON, CASINO and 24H; traffic lights run an 8-second cycle and
  street lights pool warm light on the roads.
- **On foot and by car** — walk the sidewalks or steal any car on the street.
  Cars are built in detail: stepped hoods and trunks, bumpers, mirrors,
  front wheels that turn, a taxi with a roof sign, headlights with a real
  spotlight and a pool of light on the road (L), taillights and a sport
  spoiler. A low third-person chase camera follows the car and widens its
  field of view as you go faster.
- **Traffic and pedestrians** — cars keep to their lanes and stop at red
  lights; pedestrians stroll the sidewalks and run when a gun goes off or a
  car bears down on them. Steal a car and its driver bails out and flees.
- **A wanted level, 0–5** — steal a car (+1 star, a police cruiser +2) and
  the SCPD sends cruisers that chase and ram. At four stars the avenues get
  roadblocks and HELI-1 takes station overhead with a searchlight. Get caught
  on foot and you are busted; lose all your health and you are wasted.
- **Seven story missions** — First Wheels ($500), Hot Delivery ($800),
  The Pickup ($1,200), The Big One ($3,000), Airport Run ($2,000),
  The Long Con ($2,500) and The Last Score ($4,000), each with stages, a
  beacon marker, a timer where it counts, and dialogue from Vera.
- **Side money** — drive a taxi with T for a $150–$300 fare, or pick up the
  eight cash stashes hidden around the city ($100 each, back after a minute).
  Earnings raise your reputation: Wheelman, Street Boss, King of Solstice,
  Legend of Solstice.
- **Combat** — aim with the mouse and shoot on foot or in a drive-by.
- **A rich HUD** — minimap, cash and reputation, the wanted stars, health,
  a big speedometer with a gear readout, the objective and the mission stage,
  an SCPD Response panel with each unit's callsign, distance and status, a
  Solstice FM 88.1 radio strip, and Vera's dialogue bar.
- **Sound, all synthesized** — engine hum that follows your speed, tyre
  skid, gunshots, pickups and a little radio sequencer. M mutes.
- **Save** — the run autosaves every twenty seconds and on every big event,
  and the title screen offers Continue.

## Controls

| Key | What it does |
| --- | --- |
| W A S D / arrows | Drive, or walk on foot |
| Space | Handbrake (skid) |
| E | Enter / exit a car |
| T | Taxi fare (while driving a taxi) |
| Mouse click | Shoot toward the cursor |
| P | Pause / resume |
| M | Mute |
| L | Headlights on / off |
| R | Next radio track |

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

`game/` is plain static files — no build step, no network request at run
time. The game needs a desktop browser with WebGL.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22) copies `game/` and `screenshots/` to the output
directory and writes `dossier.json` with the vendored `vendor/makefun-game.ts`.

## Screenshots

Four renders of the game in a headless browser, each 1280×800:

1. `1-drive.jpg` — the cover: a sport car running west into the sunset.
2. `2-chase.jpg` — four stars: cruisers, a roadblock and HELI-1.
3. `3-mission.jpg` — on foot at the plaza, the mission beacon over the fountain.
4. `4-foot.jpg` — on foot on the boardwalk, palms and the bay.

## License

MIT — see [LICENSE](LICENSE). Unofficial fan-made game, not affiliated with
Rockstar Games or Take-Two Interactive. No Rockstar artwork, logos, characters
or fonts are used. three.js r160 is vendored under `game/vendor/` under its
own license.

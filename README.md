# breachline

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Baophan00/breachline/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Baophan00/breachline/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical shooter in the Counter-Strike tradition, built with three.js and no build step. Two teams of five contest two bomb sites in a small dockyard: the Raiders plant a charge, the Wardens hold the sites and defuse. Rounds are short, money carries between them, and accuracy beats speed — moving while you shoot throws the round away.

Everything is original: the map (Harborline), the weapons (MK2 Sidearm, VK-74, Pd-9 Kestrel, Breaker 12), the bots and the art, which is procedural — textures are painted into canvases at load, sound is synthesised with the WebAudio API, and three.js 0.187.0 is vendored. The game makes no network request.

What is in it:

- **Rounds and economy.** 12-second buy phase, 1:45 rounds, first to 8. Kills pay, wins pay more, losses pay a growing bonus; armour carries damage between rounds.
- **The charge.** The Raiders' carrier plants at A or B (3.2 s), the charge runs 40 s, the Wardens defuse it in 5.5 s. Elimination also ends a round.
- **Gunplay where accuracy counts.** Per-weapon recoil ladders that climb and recentre, spread that grows with movement and shrinks when crouched, damage falloff, head/chest/stomach/leg multipliers, armour and helmets.
- **Bots with roles and nerves.** Each bot picks a site, paths over a 0.5 m nav grid with A*, holds an angle as a Warden or pushes as a Raider, and fights with a reaction delay, aim error that settles while it tracks, burst fire, strafing and crouching.
- **An interface that reads at a glance.** Minimap painted from the nav grid, kill feed, round clock, buy menu, scoreboard on Tab, bomb timer, hit markers and damage vignette.

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and click to play. `game/index.html` is a plain static file too: any static server can host `game/` as it is.

To hand the entry in the way the bounty asks, run the program that writes `/output`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Controls

| Key | Action |
| --- | --- |
| W A S D | move |
| mouse | look, left button fires |
| Shift | walk (quiet, accurate) |
| Ctrl or C | crouch |
| Space | jump |
| R | reload |
| 1 2 3 | sidearm, rifle, SMG |
| B | buy menu, in the buy phase |
| E | plant the charge, or defuse it |
| Tab | scoreboard |

## Layout

```
game/          the game: index.html plus ES modules, three.js vendored under game/vendor
  src/config.js     weapons, economy, round timing, bot difficulty
  src/world.js      the map as axis-aligned brushes, procedural textures, skirt and props
  src/nav.js        walkable grid and A* for the bots
  src/actor.js      the shared body: mesh, movement, collision
  src/player.js     first-person movement, camera, weapon state
  src/bots.js       perception, pathing, aiming and firing
  src/combat.js     hitscan, damage, tracers, impacts
  src/round.js      round flow, the charge, the economy, the score
  src/hud.js        the DOM HUD and the minimap
  src/audio.js      synthesised sound
  src/viewmodel.js  the first-person weapon
main.ts        copies game/ and screenshots/ to /output and writes dossier.json
screenshots/   four captures of the game running in Chrome
```

## Credits

three.js 0.187.0 (MIT) is vendored byte for byte from npm under `game/vendor/three/`. Everything else in this repository was written for this entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rq4dyf99&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>

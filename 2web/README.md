# Turf Trouble: the 2Web build

This folder holds the 2Web version of this project, made to follow the 2Web porting rules
("Putting a game on 2Web: the rules", 2026-11-15).

- `turf-trouble/` is the finished static build, exactly as it unzips.
- `dist/turf-trouble-1.0.0.zip` is the zip to send to 2Web.
- `package.py` checks the build against the rules a script can check, then writes the zip.

## Why it is a remake and not a Unity WebGL export

The Unity project in this repository could not be listed as it is:

| Rule | Problem with the Unity project | What the 2Web build does |
|---|---|---|
| 5.1 rating | Realistic gun fights with blood, against police and passers-by | Cartoon paint gadgets, nobody is hurt: people get splattered and run off. Rated 12+ |
| 5.2 brands | Named and styled after another game series, including its logo font and wanted stars | New name, new look, system fonts, police badges for heat |
| 2.4 size | 5.7 GB project, far over 50 MB even when built | 0.9 MB unzipped, 14 files, no downloads after load |
| 4.1, 4.2 | Fixed layout, mouse lock and keyboard only | Fills any box, resizes live, full touch controls |
| 2.5 sandbox | Needs pointer lock and a quit button | Drag to look, nothing the sandbox blocks |
| 2.6 saves | Binary save file on disk | `localStorage` key `turf-trouble:save` |
| 3 SDK | None | `TwoWeb.ready / onPause / ad / score`, works without the SDK too |

The remake keeps the original's structure: an open town on foot or by car, the same four-mission
story (find your house and save, meet Frank at the police station, pick up your gear at home,
find Gonzalves), money, a health bar, a four-slot inventory, a small map and a full map, a heat
level with police chases, walking and driving traffic, and New Game / Continue.

Everything is drawn from code with three.js (bundled in `lib/`, MIT licence) and all sound is
synthesised, so no asset from the Unity project is shipped.

## Checking it

```
python3 2web/package.py          # rule checks, then writes dist/<slug>-<version>.zip
```

To play it, serve the unzipped folder from any local web server and open `index.html`. Without
the 2Web SDK every ad comes back "not shown" and the game plays normally. (The SDK script line
points at `../../sdk/2web.js`, which only exists on the 2Web site, so on its own the browser logs
one 404 for that file.)

`window.__game` exposes the game state and a few helpers (`teleport`, `completeMission`,
`offence`, `busted`) for automated playtests.

## Ads

- Interstitial: only after pressing Continue on a pop-up (mission complete, caught, splattered,
  bonus job done). Play is already stopped at that point.
- Rewarded: only behind `▶ WATCH AD: KEEP YOUR $...` on the caught and splattered pop-ups. The
  cash is kept only when `rewarded === true`.
- `onPause(true)` freezes the game and suspends the audio; `onPause(false)` carries on.

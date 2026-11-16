# Handoff: porting Gangster-Game-Clone to 2Web

Read this first. It gives you everything you need to carry on from where the last session stopped.

## The task

The user asked: port the game in this repository to 2Web following `source-docs/porting.md` (the
2Web rules). If the game isn't allowed for any reason, change it so it complies, "by any means
necessary".

## Where things stand

**Done, committed and pushed** on branch `claude/quirky-babbage-k9g23o` of
`github.com/Oggaboo/Gangster-Game-Clone`:

- `2web/turf-trouble/`: a new static web game, **Turf Trouble** (three.js, about 0.9 MB, 14
  files). It is a remake rather than an export of the Unity game, for the reasons below.
- `2web/dist/turf-trouble-1.0.0.zip`: the zip to send to 2Web.
- `2web/package.py`: checks every rule a script can check, then writes the zip.
  Run: `python3 2web/package.py`.
- `2web/README.md`: why it is a remake, the ad placement, how to check it.

**Not done:**

- No real person has played it; only automated tests in headless Chromium have.
- It has not been run inside the real 2Web site project (`npm run check`, the real SDK,
  `catalog.json`). That project is not in this repository.
- Nothing has been sent to 2Web.

## Why a remake instead of a Unity WebGL export

The Unity project (Unity 2021.3.24f1, 5.7 GB) would be sent back by 2Web even if it were exported:

| Rule | Problem |
|---|---|
| 5.1 rating | Realistic gun fights with blood, against police and passers-by |
| 5.2 brands | Named and styled after another game series (the project is named `GTAVClone`, it uses that series' logo font `pricedow.ttf` and its wanted stars) |
| 2.4 size | 5.7 GB of assets, against a 50 MB limit |
| 4.2 touch | Keyboard and mouse only |
| 2.5 sandbox | Mouse lock and a quit button |
| 2.6 saves, 3 SDK | Binary save file on disk, no 2Web SDK |

Exporting also needs a Unity editor and licence. The cloud session had neither, and the 429 `.fbx`
files in a plain clone are Git LFS placeholders.

## The user's latest questions

1. "Can you not just port it into Unity for web?" The answer given: an export is possible with a
   Unity licence, but it would fail the rules above, so the Unity game would need a rewrite anyway.
2. "What licence do you need?" The answer given: Unity Personal (free), via a Unity ID and Unity
   Hub, with editor 2021.3.24f1 and the WebGL Build Support module. The recommended route was for
   the user to build on their own computer, with Claude editing the scripts and pushing. The user
   was told never to paste a Unity password into a chat.
3. "Give me everything so another agent can pick up." This folder is the result.

The open decision is the user's: send Turf Trouble, or rework the Unity project to meet the rules
and have the user build it. Ask them if it isn't clear.

## How Turf Trouble maps to the original

| Original (Unity) | Turf Trouble |
|---|---|
| Town with traffic and pedestrians | Generated 6 x 6 block town (`js/world.js`), lane-following traffic, pavement walkers |
| Drive cars with F / G | E to get in or out of the dark "crew" cars |
| Missions: find house and save, meet Frank at the police station, find weapons at home, kill Gonzalves | Same four steps; the weapons are paint gadgets; Gonzalves and his crew are "painted out of town" at the scrapyard |
| Money, health, ammo, inventory of four weapons | Money, health, ammo, four gadgets (one free, three for sale) |
| Wanted stars, police and FBI spawners | A heat level shown as badges; police on foot and in cars; being caught costs a $200 fine |
| Minimap, full map on M | Same |
| Save and continue | `localStorage` key `turf-trouble:save` |

## Code layout (`2web/turf-trouble/`)

- `index.html`: the SDK line `<script src="../../sdk/2web.js"></script>` comes before the game
  module, as the rules require.
- `js/main.js`: game state, missions, player, driving, police, the gang, ads, saving and the main
  loop. `window.__game` exposes the state and the test helpers `teleport`, `completeMission`,
  `offence`, `busted`, `hurtPlayer` and `save`.
- `js/world.js`: town generation (seeded), collision grid, map picture, points of interest.
- `js/actors.js`: box-built people and cars.
- `js/input.js`: keyboard, mouse drag to look, touch joystick and buttons.
- `js/audio.js`: Web Audio synthesis; starts only after the first input; muted while paused.
- `js/ui.js`: HUD, pop-ups and maps.
- `js/platform.js`: `TwoWeb` wrapper. Without the SDK, every call does nothing and ads return
  `{ rewarded: false }`.
- `lib/three.module.min.js`: three.js r170 (MIT licence, bundled because loading it from a CDN
  would break rule 2.3).

**Ads:** interstitials run only after Continue on a pop-up (mission complete, caught, splattered,
bonus job done). The rewarded ad sits only behind `▶ WATCH AD: KEEP YOUR $...` on the caught and
splattered pop-ups.

**Listing:** `2web.json` uses rating `"12"` with the note "cartoon paint-blaster fights, no blood"
and the categories action and adventure. The user hasn't reviewed the title, description or
pictures yet.

## Testing (`test-tools/`)

These scripts ran from a scratch folder in the old session. The paths and ports in them are from
that session, so adjust them.

- `serve.mjs <root> <port>`: a tiny static server.
- `fake-2web-sdk.js`: a stand-in SDK with labelled fake ads (`window.__adMs` sets their length).
  Serve it at `<root>/sdk/2web.js` with the game at `<root>/games/turf-trouble/`.
- `play.mjs`: a full desktop playthrough with 36 checks; all passed.
- `phone.mjs`: touch controls at 390 x 844, plus the 40 px safe area; all passed.
- `alone.mjs`: the game with no SDK, traffic flow and ad fallbacks. All passed except the last
  check, which was too strict about timing; `chase.mjs` then showed the police cars do reach the
  player.
- `art.mjs`: renders `cover.jpg` and `thumb.webp` from the game itself.

Run them with the pre-installed Playwright. They need software WebGL:

```
NODE_PATH=$(npm root -g) node play.mjs <screenshot-dir> http://localhost:<port>/games/turf-trouble/
```

On its own (without the 2Web site) the browser logs one 404 for `../../sdk/2web.js`. That is
expected: the rules require that exact path.

## Rules for working in this repository

- Work and push on branch `claude/quirky-babbage-k9g23o`. Don't open a pull request unless the
  user asks.
- Don't put model names in commits or in code.
- The original Unity project under `Assets/` is untouched. Leave it that way unless the user
  chooses the Unity route.

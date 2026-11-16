# Putting a game on 2Web: the rules

This is the only document a developer needs to get a game onto 2Web, and the only one an agent
follows when one arrives. Rewritten 2026-11-15 to replace the old porting notes (three routes and
shims), which ended with the agent editing other people's builds by hand.

## The one rule

**2Web does not fix games. It accepts them or sends them back.**

The developer sends one zip that drops straight into the site. The agent unzips it, copies the
listing into the catalog, plays it, and ships it. If anything below is missing or broken, the
agent writes back saying which rule failed and does **not** edit the game's code, rebuild it or
swap SDKs. That is the developer's job, in their own project, where it takes minutes instead of
hours.

"Must" means the game is sent back without it. "Should" means it is accepted, and the developer is told.

---

## 1. What to send

One zip, named `<slug>-<version>.zip` (for example `huss-valley-1.4.0.zip`), that unzips to
exactly this:

```
<slug>/
    index.html        the game starts here
    2web.json         the listing (section 6)
    thumb.webp        tile picture, 512 x 512 (section 7)
    cover.jpg         picture behind the Play button, 1280 x 720 (section 7)
    ...               everything else the game needs, in any folders
```

- `<slug>` is the game's web name: lowercase letters, digits and dashes (`snake-vs-ai`). It
  becomes the address `2web.lol/game/<slug>` and **never changes** once live.
- Nothing outside that one folder, no second `index.html` at the top, no `__MACOSX`, no source
  files or `node_modules`.

## 2. Build rules

1. **Must be a finished static web build.** HTML, JS, CSS, images, sound, WASM, data files. No
   server code, no build step on our side, no "run npm install".
2. **Must use relative paths only.** The game runs from `/games/<slug>/`. Any path starting with
   `/` or the full site address breaks it. (Vite: `base: './'`. Unity WebGL and Godot exports are
   relative by default; don't change that.)
3. **Must load nothing from the internet.** Every file the game uses is inside the zip: no CDNs,
   web fonts, analytics, trackers, or other platforms' SDKs (GameMonetize, Playgama, Poki,
   CrazyGames, Google). The only outside file allowed is the 2Web SDK (section 3).
4. **Must stay within the size limits.** Each file at most **25 MB** (Cloudflare's hard limit;
   split Unity `.data` files if needed). The whole game at most **50 MB** and at most **500
   files**. Should start playing after downloading under **10 MB** (phones on mobile data).
5. **Must run in a sandbox.** The game is in a frame that blocks popups (`window.open`), leaving
   the page, form submits and `alert` / `confirm` / `prompt`. The game must not need any of them.
   No links out of the game.
6. **Must keep its saves to itself.** `localStorage` keys start with `<slug>:`
   (`snake-vs-ai:best`). IndexedDB names start with `<slug>`. No cookies. Never read or delete keys
   the game didn't write.
7. **Must start with no errors.** No red errors in the browser console from load to the first
   round.
8. **Should** show its version number somewhere (settings screen or `console.log` at start).
9. **Should** expose `window.__game` (studio rule, for automated playtests).

## 3. The 2Web SDK: four calls

Add this line to `index.html`, **before** the game's own scripts, exactly as written. Don't copy
the file into the zip: the site serves it, so fixes reach every game at once.

```html
<script src="../../sdk/2web.js"></script>
```

```js
TwoWeb.ready()                                    // MUST: call once the menu can be clicked
TwoWeb.onPause(paused => game.setPaused(paused))  // MUST: pause gameplay AND mute while an ad shows
const { rewarded } = await TwoWeb.ad('interstitial')   // or 'rewarded'
if (rewarded) giveReward()                        // reward only when rewarded === true
TwoWeb.score(points)                              // optional: shows under the game
```

- **Must call `ready()`.** Until it does, the page says "Loading…". If the game crashes before
  `ready()`, the SDK shows the error on screen instead of a blank box.
- **Must pause and mute in `onPause`,** and carry on when it is called with `false`. The answer to
  every `ad()` call always arrives, even when no ad is shown, so the game is never stuck.
- **Ads only at natural breaks:** between rounds or levels, never mid-play, never on a timer.
  Rewarded ads only behind a button the player presses, labelled `▶ WATCH AD: <reward>`. The site
  already limits ads (one at a time, 30 s apart, Play counts as one), so the game needs no timers.
- **Must still work without 2Web.** Opened on its own (`index.html` in a browser), every call
  does nothing and ads come back "not shown". The game must play normally. This is what lets the
  same build go to other publishers later.

Games built on the studio kit get all of this from `kit/platform.js` (its 2Web branch); the
2Web build is the kit's normal build plus the script line.

## 4. Screen, controls, sound

1. **Must fill whatever box it is given and keep filling it when the box changes size.** On
   computers the game is a 16:9 box from about 600 to 1100 px wide; on phones it fills the whole
   screen, usually upright (for example 375 x 812). Listen for `resize`; no fixed canvas sizes, no
   black bars hiding buttons, nothing important in the outer 40 px of a phone screen (the 2Web exit
   tab sits on the left edge, halfway down).
2. **Must be playable on a phone by touch and on a computer with keyboard and mouse.** If the game
   only works sideways, it shows a "turn your phone" screen when upright instead of breaking.
3. **Must not start sound before the first tap or key press** (browsers block it anyway), and
   must mute when paused. Should have its own mute button.
4. **Must not need its own full-screen button** (2Web has one). If it has one anyway, it may
   only call `requestFullscreen()` and must cope with being refused.
5. **Must not need anything typed before the first round.** If the game asks for a name, an
   empty name is fine and Play still works.
6. **Should** show something moving within 5 seconds on a mid-range phone, and keep its normal
   frame rate (2Web never asks for a lower one).

## 5. Content rules

These come from [ratings.md](ratings.md) and the site rules. Any one failing means the game is
not listed.

1. **Rating: Everyone or 12+, nothing above.** Everyone: no fighting, no weapons used on people,
   nothing scary, no gambling. 12+: cartoon or fantasy fighting, weapons without blood, mildly
   scary. Gore, realistic violence, horror, sexual content, gambling (including loot boxes for
   real money), drugs and strong language are not listed at all. When unsure, pick the stricter one.
2. **No one else's brands:** no characters, names, logos or look from other games, films or
   shows (Minecraft-style blocks, Roblox avatars, Disney-style princesses), no real people, no real
   car makes, no memes ("skibidi", "brainrot", "67"). Checked by eye on the pictures, not just
   the title.
3. **No chat, no comments, no player uploads, no player-to-player messages.** These would bring
   the site under the Online Safety Act. AI opponents and leaderboards of typed names stored on the
   device are fine.
4. **No payments, no real money, no collecting personal data.** Nothing a player types leaves
   their device.
5. **No adverts inside the game** other than through `TwoWeb.ad()`.

## 6. The listing: `2web.json`

The agent copies this into `public/data/catalog.json` as it is, so fill it in exactly:

```json
{
    "slug": "snake-vs-ai",
    "title": "Snake vs AI",
    "version": "1.4.0",
    "description": "Slither out of your land, loop back home to claim everything inside, and cut the AI snakes' trails before they cut yours. Own the most land when time runs out to win.",
    "controls": "WASD / arrows / mouse to steer, drag on touch screens. Space to boost, Esc to pause.",
    "categories": ["arcade", "casual"],
    "tags": ["snake", "bots", "territory"],
    "rating": "everyone",
    "ratingNote": ""
}
```

| Field | Rule |
|---|---|
| `title` | The name on the tile. No "Free", "Online", "2025", "HD" or emoji |
| `description` | 1 to 3 plain sentences, 80 to 300 characters: what you do and how you win. Must not name other games or claim popularity ("most played", "millions of players") |
| `controls` | Keyboard **and** touch, in one or two sentences |
| `categories` | 1 to 3 of: `action`, `puzzle`, `racing`, `sports`, `casual`, `arcade`, `two-player`, `idle`, `strategy`, `adventure`, `simulation`, `board`, `dress-up`, `io`. Dress Up, .io, Board & Card and Idle only if the title says so; 2 Player only with a real two-people-one-device mode ([adding-a-game.md](adding-a-game.md)) |
| `tags` | 3 to 6 lowercase words people might search for |
| `rating` | `"everyone"` or `"12"` |
| `ratingNote` | Required for `"12"`: what earns it, in a few words ("cartoon sword fights") |

2Web fills in the rest itself (`added`, `hue`, `featured`, `studio`, `status`, file paths).

## 7. Pictures and video

| File | Size | Rules |
|---|---|---|
| `thumb.webp` (or `.jpg`) | exactly 512 x 512, under 150 KB | The game's title and its main character or action, readable at 100 px. Square corners and no border (the site rounds and frames tiles). Keep the top-left corner plain (the site puts a small badge there). No screenshot of a menu, no "PLAY" text, no other brands |
| `cover.jpg` | exactly 1280 x 720, under 300 KB | Shown behind the Play button before the game loads. Bright, from the game, with the title. Keep the centre (roughly the middle third) free of text: the Play button covers it |

**Video: none.** Don't send gameplay videos. Cloudflare's terms limit free sites that serve video
files, so 2Web only shows videos that partner hosts serve themselves. This changes only if 2Web
moves big files to Cloudflare R2; this document will say so.

## 8. Check it yourself before sending

1. Unzip your own zip into an empty folder and open `index.html` from a local web server (not
   by double-clicking it): the game plays, ads come back "not shown", no console errors.
2. In a copy of the 2Web project (`npm run dev`), put the folder in `public/games/<slug>/`, add
   the listing to `catalog.json`, run `npm run check`, open `localhost:8888/game/<slug>`, and play
   one full round on a phone-sized window (390 x 844) and a laptop-sized one (1366 x 768). Set
   `provider: 'test'` in `ADS` in `public/assets/js/config.js` (labelled fake 3-second ads; the
   launch check refuses to deploy it, so put it back to `'none'` after) and trigger one ad: the
   game pauses, goes quiet, and resumes.
3. Resize the window while playing: nothing gets cut off.

## 9. What 2Web does with it (agent steps)

1. Check the zip against sections 1 to 7. Any "must" failing: **stop and send it back** with the
   rule numbers, for example "2.3: loads a font from fonts.googleapis.com; 4.1: buttons cut off at
   375 x 812". Don't fix it.
2. Unzip to `public/games/<slug>/` (replacing the old folder for an update). Copy `2web.json` into
   `catalog.json` with `added` (today, first release only), `hue`, `studio`, `status: "live"`,
   `embed`, `thumbnail`, `cover`. Keep `2web.json` in the folder as the record.
3. `npm run build` (the checker fails on bad listings or missing files).
4. Play it in the browser: phone and laptop size, a full round, one ad, a resize. Look at the
   pictures on the home page and game page.
5. Deploy when the owner has said yes, then run `node tools/gamemonetize/check-live.mjs https://2web.lol`.

## 10. Updates

Send a new zip with the same slug and a higher version. It replaces the whole folder, so include
every file. Save data must keep working (read old saves, don't wipe them). A new title, pictures
or description go in the new `2web.json`.

---

## Not covered by these rules

- **Partner games from GameMonetize's catalog** are not sent to us; they are listed from
  GameMonetize's feed and play from GameMonetize's own servers. Their screening (brands, rating,
  category fit, pictures checked by eye) is in [adding-a-game.md](adding-a-game.md) and
  `tools/gamemonetize/README.md`.
- **Old builds made only for GameMonetize or Playgama** (no 2Web build available). The site still
  has stand-ins (`sdk/gamemonetize-shim.js`, `sdk/playgama-shim.js`) that ran Snake vs AI and
  Throw an Egg! without code changes: swap the platform's script tag for the stand-in. Use this
  only with the owner's OK and only when the developer can't send a proper build; it doesn't cover
  rewarded ads on GameMonetize builds, or Playgama leaderboards and payments.

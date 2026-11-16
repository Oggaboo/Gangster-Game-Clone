import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const out = process.argv[2], URL = process.argv[3] || 'http://localhost:8931/games/turf-trouble/'
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 640, height: 360 } })
const p = await ctx.newPage()
const errs = []
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()) })
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
p.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()))
const ev = (f, a) => p.evaluate(f, a)
const shot = (n) => p.screenshot({ path: `${out}/${n}.png` })
const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name)
const g = (expr) => ev(`(() => { const G = __game; return ${expr} })()`)
const until = (expr, ms = 30000) => p.waitForFunction(`(() => { const G = __game; return ${expr} })()`, null, { timeout: ms }).then(() => true, () => false)
const clickModal = async (i = 0) => { await p.locator('#modal-buttons button').nth(i).click() }

await p.goto(URL)
await p.waitForTimeout(1500)
await ev(() => { window.__adMs = 400 })
ok('ready called', (await ev(() => window.TwoWeb?._log?.[0])) === 'ready')
await p.click('#btn-new')
await p.waitForTimeout(600)
await p.keyboard.press('KeyX')
ok('intro skipped to play', await until(`G.state.mode === 'play'`))

// driving
const car = await g(`(() => { const c = G.cars.find(c => c.kind === 'crew' && Math.hypot(c.x - G.player.x, c.z - G.player.z) < 20); return [c.x, c.z] })()`)
await ev(([x, z]) => __game.teleport(x, z - 2.6), car)
await p.waitForTimeout(400)
ok('drive prompt', (await p.locator('#prompt').textContent()).includes('Drive'))
await p.keyboard.press('KeyE')
ok('entered car', await until(`!!G.player.car`))
await p.keyboard.down('KeyW')
ok('car accelerates', await until(`G.player.car && G.player.car.speed > 12`))
await shot('drive')
await p.keyboard.up('KeyW'); await p.keyboard.down('Space')
ok('car brakes', await until(`G.player.car && Math.abs(G.player.car.speed) < 1`))
await p.keyboard.up('Space')
await p.keyboard.press('KeyE')
ok('left car', await until(`!G.player.car`))

// mission 1: hideout save pad
await ev(() => { const s = __game.poi.hideout.save; __game.teleport(s[0] + 3, s[1]) })
await p.keyboard.down('KeyA')   // facing +z after teleport keeps cam yaw; just walk onto pad via teleport instead
await p.keyboard.up('KeyA')
await ev(() => { const s = __game.poi.hideout.save; __game.teleport(s[0], s[1]) })
ok('mission 1 complete', await until(`G.state.mission === 1`))
await shot('mission1')
ok('saved', await ev(() => !!localStorage.getItem('turf-trouble:save')))
await clickModal()
ok('ad pauses game', await until(`G.state.adPaused === true`, 3000))
ok('ad resumes + modal closed', await until(`G.state.adPaused === false && document.getElementById('modal').hidden`, 5000))

// mission 2: Frank
await ev(() => { const s = __game.poi.station.frank; __game.teleport(s[0], s[1] + 2) })
ok('mission 2 complete', await until(`G.state.mission === 2 && G.state.money >= 1600`))
await clickModal(); await until(`document.getElementById('modal').hidden`, 5000)
await shot('station')

// mission 3: popper
await ev(() => { const s = __game.poi.hideout.stands[0]; __game.teleport(s[0], s[1] + 1.2) })
ok('mission 3 complete + gadget', await until(`G.state.mission === 3 && G.state.gadget === 0`))
await clickModal(); await until(`document.getElementById('modal').hidden`, 5000)
ok('gang spawned', (await g(`G.gang.length`)) === 6)
await shot('hideout')

// buying
await ev(() => { __game.state.money = 5000; const s = __game.poi.hideout.stands[3]; __game.teleport(s[0], s[1] + 1.6) })
await p.waitForTimeout(500)
await p.keyboard.press('KeyE')
ok('bought launcher', await until(`G.state.owned[3] && G.state.gadget === 3`, 4000))
await p.keyboard.press('Digit1')
ok('switch gadget', await until(`G.state.gadget === 0`, 4000))

// fight: stand at the gate and fire at the crew
await ev(() => { const t = __game.poi.turf; __game.teleport(t.x, t.z - 21); __game.cam.yaw = 0; __game.cam.pitch = 0.15 })
await p.waitForTimeout(600)
await shot('turf')
await p.keyboard.down('KeyK')
const t0 = Date.now()
let won = false
while (Date.now() - t0 < 150000) {
    // keep facing the nearest standing crew member and keep health up (this is a smoke test, not a skill test)
    await ev(() => {
        const G = __game, P = G.player
        const e = G.gang.filter((e) => e.state !== 'down').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0]
        if (e) G.cam.yaw = Math.atan2(e.x - P.x, e.z - P.z)
        P.health = 200
    })
    if (await g(`G.state.mission === 4`)) { won = true; break }
    await p.waitForTimeout(250)
}
await p.keyboard.up('KeyK')
ok('boss beaten, story complete', won)
await shot('win')
ok('score reported', (await ev(() => window.TwoWeb._log.filter((l) => l.startsWith('score')).length)) >= 4)
await clickModal(); await until(`document.getElementById('modal').hidden`, 5000)

// police: heat, caught, rewarded ad
await ev(() => { const s = __game.poi.start; __game.teleport(s[0], s[1]); __game.offence(70) })
ok('police arrive', await until(`G.cops.length >= 1`, 20000))
ok('caught', await until(`!document.getElementById('modal').hidden && document.getElementById('modal-title').textContent === 'CAUGHT!'`, 90000))
await shot('caught')
const money = await g(`G.state.money`)
await clickModal(1)
ok('rewarded ad keeps cash', await until(`document.getElementById('modal-body').textContent.includes('keep your cash')`, 5000))
await clickModal(0)
ok('respawn at station, heat cleared, no fine', await until(`document.getElementById('modal').hidden && G.state.heat === 0 && G.state.money === ${money}`, 5000))

// splattered
await ev(() => __game.hurtPlayer(999))
ok('splattered pop-up', await until(`document.getElementById('modal-title').textContent === 'SPLATTERED!'`, 3000))
await clickModal(0)
ok('fine paid after interstitial', await until(`document.getElementById('modal').hidden && G.state.money === ${money - 100}`, 5000))

// pause, map, mute
await p.keyboard.press('Escape')
ok('pause opens', await until(`G.state.userPaused`, 3000))
const t1 = await g(`G.state.time`); await p.waitForTimeout(500)
ok('time stops while paused', (await g(`G.state.time`)) === t1)
await p.keyboard.press('Escape')
ok('pause closes', await until(`!G.state.userPaused`, 3000))
await p.keyboard.press('KeyM'); await p.waitForTimeout(400); await shot('map')
ok('map opens', await g(`G.state.mapOpen`))
await p.keyboard.press('KeyM')

// save + continue after reload
await ev(() => __game.save())
await p.reload(); await p.waitForTimeout(1500)
ok('continue offered', await p.locator('#btn-continue').isVisible())
await p.click('#btn-continue')
ok('save restored', await until(`G.state.mode === 'play' && G.state.mission === 4 && G.state.owned[3] && G.state.money === ${money - 100}`, 5000))
const keys = await ev(() => Object.keys(localStorage))
ok('storage keys prefixed: ' + keys.join(','), keys.every((k) => k.startsWith('turf-trouble:')))
ok('no cookies', (await ev(() => document.cookie)) === '')

// resize while playing
for (const [w, h] of [[1366, 768], [600, 338], [390, 844], [844, 390]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(700)
    const s = await ev(() => { const c = document.getElementById('view'); return [c.width, c.height, c.clientWidth, c.clientHeight, innerWidth, innerHeight] })
    ok(`resize ${w}x${h} fills box`, s[2] === w && s[3] === h && Math.abs(s[0] / s[1] - w / h) < 0.02)
    await shot(`size-${w}x${h}`)
}
console.log(errs.length ? errs.join('\n') : 'no console errors')
await b.close()

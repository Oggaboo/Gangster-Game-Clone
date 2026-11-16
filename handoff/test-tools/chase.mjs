import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 480, height: 270 } })
await p.goto('http://localhost:8932/games/turf-trouble/'); await p.waitForTimeout(1200)
await p.click('#btn-new'); await p.waitForTimeout(800); await p.keyboard.press('KeyX')
await p.waitForFunction(() => __game.state.mode === 'play'); await p.waitForTimeout(400)
// sit in a parked car in the middle of town, so officers on foot cannot end the chase early
await p.evaluate(() => { const G = __game, c = G.cars.find((c) => c.kind === 'crew'); c.x = 0; c.z = 3.2; c.yaw = Math.PI / 2; G.teleport(0, 5.5) })
await p.waitForTimeout(300); await p.keyboard.press('KeyE'); await p.waitForTimeout(300)
await p.evaluate(() => { __game.offence(100); __game.state.bustHold = true })
let min = 999, seen = 0
for (let i = 0; i < 120; i++) {
    const s = await p.evaluate(() => { const G = __game; G.state.heat = 100; G.state.bust = 0; return G.cars.filter((c) => c.kind === 'police' && c.chasing).map((c) => Math.round(Math.hypot(c.x - G.player.x, c.z - G.player.z))) })
    seen = Math.max(seen, s.length); if (s.length) min = Math.min(min, ...s)
    if (min < 8) break
    await p.waitForTimeout(500)
}
console.log(`police cars seen: ${seen}, closest approach: ${min} m`, (await p.evaluate(() => !!__game.player.car)) ? '(player in car)' : '')
await b.close()

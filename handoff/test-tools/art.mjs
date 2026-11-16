import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const out = process.argv[2]
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const [name, w, h] of [['cover', 1280, 720], ['thumb', 512, 512]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.goto('http://localhost:8931/games/turf-trouble/')
    await p.waitForTimeout(1200)
    await p.click('#btn-new'); await p.waitForTimeout(900); await p.keyboard.press('KeyX')
    await p.waitForFunction(() => __game.state.mode === 'play')
    await p.evaluate(() => { const G = __game; G.state.mission = 2; const s = G.poi.hideout.stands[0]; G.teleport(s[0], s[1] + 1) })
    await p.waitForFunction(() => __game.state.mission === 3)
    await p.evaluate(() => { window.__adMs = 100 })
    await p.click('#modal-buttons button')
    await p.waitForFunction(() => document.getElementById('modal').hidden && !__game.state.adPaused); await p.waitForTimeout(300)
    await p.evaluate((name) => {
        const G = __game, t = G.poi.turf, P = G.player, thumb = name === 'thumb'
        G.teleport(t.x - 1, t.z - 12.5)
        const car = G.cars.find((c) => c.kind === 'crew'); car.x = t.x + 6.5; car.z = t.z - 13.2; car.yaw = 2.2
        car.model.group.position.set(car.x, 0.18, car.z); car.model.group.rotation.y = car.yaw
        G.beam.visible = false; G.state.mapOpen = true     // freezes the game so the scene can be posed
        const g = P.person.group
        g.position.set(P.x, 0.18, P.z); g.rotation.y = thumb ? 0.5 : 0.75
        P.person.armR.rotation.x = -Math.PI / 2; P.person.legL.rotation.x = 0.35; P.person.legR.rotation.x = -0.35; P.person.armL.rotation.x = 0.3
        G.gang.forEach((e, i) => { e.person.armR.rotation.x = -Math.PI / 2; e.person.group.rotation.y = Math.PI + (i % 2 ? 0.3 : -0.2) })
        const cam = G.renderer && window.__cam
        const s = document.createElement('style')
        s.textContent = '#hud,#touch,#map,#caption{display:none!important}' +
            '#art{position:fixed;font:italic 900 96px "Trebuchet MS","Segoe UI",system-ui,sans-serif;line-height:.86;letter-spacing:-.02em;color:#ffd23f;text-shadow:0 .07em 0 #141826,0 0 .25em rgba(0,0,0,.6);transform:rotate(-4deg);-webkit-text-stroke:.035em #141826;paint-order:stroke fill}#art span{color:#22d3ee}'
        document.head.append(s)
        const d = document.createElement('div'); d.id = 'art'; d.innerHTML = 'TURF<br><span>TROUBLE</span>'
        d.style.cssText = thumb ? 'left:26px;bottom:22px;font-size:92px' : 'left:40px;top:30px;font-size:96px'
        document.body.append(d)
    }, name)
    // place the camera by hand (the game loop does not move it while frozen)
    await p.evaluate(async (name) => {
        const G = __game, t = G.poi.turf, thumb = name === 'thumb'
        const cam = G.camera
        if (thumb) { cam.position.set(t.x - 2.4, 2.6, t.z - 15.6); cam.lookAt(t.x + 0.2, 0.2, t.z - 8) }
        else { cam.position.set(t.x - 4.2, 2.2, t.z - 17.4); cam.lookAt(t.x + 1.5, 1.5, t.z - 8) }
    }, name)
    await p.waitForTimeout(600)
    await p.screenshot({ path: `${out}/${name}.png` })
    await p.close()
}
await b.close()

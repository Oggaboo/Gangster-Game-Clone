// Turf Trouble: game logic and main loop.

import * as THREE from '../lib/three.module.min.js'
import { buildWorld, groundY, makeLabel, nodePos, nearestNode, N, PITCH, ROAD } from './world.js'
import { makePerson, makeCar } from './actors.js'
import { createInput } from './input.js'
import { createAudio } from './audio.js'
import { createUI } from './ui.js'
import { platform } from './platform.js'

const VERSION = '1.0.0'
const SLUG = 'turf-trouble'
console.log(`Turf Trouble ${VERSION}`)

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const turnTo = (a, b, t) => a + wrap(b - a) * Math.min(1, t)
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz)
const rand = (a, b) => a + Math.random() * (b - a)

// Saves stay under "<slug>:" and never break the game if storage is blocked.
const store = {
    get(k) { try { return localStorage.getItem(`${SLUG}:${k}`) } catch { return null } },
    set(k, v) { try { localStorage.setItem(`${SLUG}:${k}`, v) } catch { /* private mode */ } },
}

const GADGETS = [
    { name: 'Paint Popper', price: 0, dmg: 10, rate: 4, mag: 12, reload: 1.1, speed: 46, pellets: 1, spread: 0.012, splash: 0, grav: 3, color: 0x22d3ee },
    { name: 'Scatter Popper', price: 500, dmg: 7, rate: 1.4, mag: 6, reload: 1.5, speed: 40, pellets: 6, spread: 0.1, splash: 0, grav: 5, color: 0xff5fa2 },
    { name: 'Rapid Popper', price: 800, dmg: 6, rate: 11, mag: 30, reload: 1.5, speed: 48, pellets: 1, spread: 0.04, splash: 0, grav: 3, color: 0x9bff5f },
    { name: 'Paint Launcher', price: 1500, dmg: 45, rate: 0.9, mag: 2, reload: 2, speed: 27, pellets: 1, spread: 0, splash: 5, grav: 7, color: 0xb86adf },
]
const MISSION_TEXT = [
    'Find your hideout and save the game.',
    'Meet Frank outside the police station.',
    'Pick up the Paint Popper at your hideout.',
    'Find Gonzalves at the scrapyard and paint his crew out of town.',
    'All missions complete. The town is yours!',
]
const MAX_HEALTH = 200
const ENEMY_PAINT = 0xf08a5d
const PED_SHIRTS = [0xe4572e, 0x29a4d9, 0xf2c14e, 0x6dbb74, 0xb86adf, 0xf4f1e8, 0x3ac1b0, 0xf08a5d]
const SKINS = [0xe6b58e, 0xc98d64, 0x8d5a3b, 0xf1c9a5]
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]

// ---------------------------------------------------------------- setup
const ui = createUI()
const audio = createAudio()
const canvas = document.getElementById('view')
const input = createInput(canvas, {
    stick: document.getElementById('stick'), knob: document.getElementById('knob'),
    fire: ui.el.tFire, jump: ui.el.tJump, act: ui.el.tAct, swap: ui.el.tSwap,
})
audio.setMuted(store.get('muted') === '1')
addEventListener('pointerdown', audio.unlock, true)
addEventListener('keydown', audio.unlock, true)

let renderer
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !input.touch, powerPreference: 'high-performance' })
} catch (err) {
    document.querySelector('.tag').textContent = 'Sorry, this game needs WebGL, and this browser or device has it switched off.'
    document.querySelector('.choices').hidden = true
    platform.ready()
    throw err
}
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x9fd3f5)
scene.fog = new THREE.Fog(0xb9e0f7, 110, 380)
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a86, 2.1))
const sun = new THREE.DirectionalLight(0xfff1d0, 2.2)
sun.position.set(0.5, 1, 0.35)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 700)
const world = buildWorld(scene)
const { poi } = world

const G = {
    mode: 'menu',          // menu | intro | play
    userPaused: false, adPaused: false, mapOpen: false,
    time: 0, money: 1000, mission: 0, owned: [false, false, false, false], gadget: -1,
    heat: 0, lastOffence: -99, bust: 0, bounty: 0, bountyActive: false, rematchAt: Infinity,
    introT: 0, shake: 0, hurtFlash: 0, copTimer: 0, onPad: false,
}
const player = {
    x: 0, z: 0, y: 0, vy: 0, yaw: 0, speed: 0, vx: 0, vz: 0, health: MAX_HEALTH, car: null,
    person: makePerson({ shirt: 0xf4f1e8, pants: 0x3d5a80, hair: 0x2b2118 }),
    mag: 0, reload: 0, fireCd: 0, aimT: 0, lastHurt: -99,
}
scene.add(player.person.group)
const cam = { yaw: 0, pitch: 0.3, dist: 6, lastLook: -99 }

// ---------------------------------------------------------------- cars
const cars = []
function addCar(kind, x, z, yaw, colorIndex = 0) {
    const model = makeCar(kind, colorIndex)
    scene.add(model.group)
    const c = { kind, x, z, yaw, speed: 0, model, home: [x, z, yaw], bumpCd: 0, route: null, stuck: 0, reverse: 0, wait: 0 }
    cars.push(c)
    return c
}
function removeCar(c) {
    scene.remove(c.model.group)
    cars.splice(cars.indexOf(c), 1)
}
for (const [x, z, yaw] of world.parkSpots) addCar('crew', x, z, yaw)

// Traffic follows the right-hand lane from junction to junction.
const LANE = 3.2
function lanePoint(i, j, dir, far) {
    const [dx, dz] = DIRS[dir]
    const along = far ? PITCH - ROAD / 2 - 1.5 : ROAD / 2 + 1.5
    return [nodePos(i) + dx * along - dz * LANE, nodePos(j) + dz * along + dx * LANE]
}
function pickDir(i, j, from) {
    const options = DIRS.map((d, k) => k).filter((k) => {
        const ni = i + DIRS[k][0], nj = j + DIRS[k][1]
        return ni >= 0 && nj >= 0 && ni <= N && nj <= N && k !== (from + 2) % 4
    })
    if (options.includes(from) && Math.random() < 0.5) return from
    return options[Math.floor(Math.random() * options.length)]
}
function startRoute(c, i, j, dir) {
    c.route = { i, j, dir, far: false }
    const [tx, tz] = lanePoint(i, j, dir, false)
    c.route.tx = tx
    c.route.tz = tz
}
function spawnTraffic(count) {
    for (let n = 0; n < count; n++) {
        const i = Math.floor(Math.random() * (N + 1)), j = Math.floor(Math.random() * (N + 1))
        const dir = pickDir(i, j, Math.floor(Math.random() * 4))
        const [x, z] = lanePoint(i, j, dir, false)
        if (cars.some((o) => dist(o.x, o.z, x, z) < 8)) continue
        const c = addCar('traffic', x, z, Math.atan2(DIRS[dir][0], DIRS[dir][1]), n)
        startRoute(c, i, j, dir)
    }
}
spawnTraffic(14)

function carCircles(c, out) {
    const s = Math.sin(c.yaw), k = Math.cos(c.yaw)
    out[0] = c.x + s * 1.15; out[1] = c.z + k * 1.15
    out[2] = c.x - s * 1.15; out[3] = c.z - k * 1.15
    return out
}
const circA = [0, 0, 0, 0], circB = [0, 0, 0, 0], tmp = { x: 0, z: 0 }
// Keeps a car out of walls. Returns 0 (clear), 1 (scraping) or 2 (head-on).
function carVsWorld(c) {
    let result = 0
    const s = Math.sin(c.yaw), k = Math.cos(c.yaw)
    for (const off of [1.15, -1.15]) {
        tmp.x = c.x + s * off
        tmp.z = c.z + k * off
        const ox = tmp.x, oz = tmp.z
        if (!world.resolve(tmp, 1.05)) continue
        const px = tmp.x - ox, pz = tmp.z - oz
        c.x += px
        c.z += pz
        const against = -(px * s + pz * k) * Math.sign(c.speed || 1) / (Math.hypot(px, pz) || 1)
        result = Math.max(result, against > 0.55 ? 2 : 1)
    }
    return result
}
// Pushes car a out of car b. Returns true if they touched.
function carVsCar(a, b) {
    if (dist(a.x, a.z, b.x, b.z) > 5) return false
    carCircles(a, circA)
    carCircles(b, circB)
    let hit = false
    for (let i = 0; i < 4; i += 2) for (let j = 0; j < 4; j += 2) {
        const dx = circA[i] - circB[j], dz = circA[i + 1] - circB[j + 1], d = Math.hypot(dx, dz)
        if (d < 2 && d > 0.001) {
            a.x += (dx / d) * (2 - d)
            a.z += (dz / d) * (2 - d)
            hit = true
        }
    }
    return hit
}

function updateTraffic(c, dt) {
    const r = c.route
    if (dist(c.x, c.z, r.tx, r.tz) < 2.6) {
        if (!r.far) {
            r.far = true
        } else {
            r.i += DIRS[r.dir][0]
            r.j += DIRS[r.dir][1]
            r.dir = pickDir(r.i, r.j, r.dir)
            r.far = false
        }
        ;[r.tx, r.tz] = lanePoint(r.i, r.j, r.dir, r.far)
    }
    const want = Math.atan2(r.tx - c.x, r.tz - c.z), diff = wrap(want - c.yaw)
    // stop for anything in the way
    const s = Math.sin(c.yaw), k = Math.cos(c.yaw)
    let blocked = false
    const check = (x, z, reach) => {
        const dx = x - c.x, dz = z - c.z, ahead = dx * s + dz * k
        if (ahead > 0.5 && ahead < reach && Math.abs(dx * k - dz * s) < 1.9) blocked = true
    }
    if (!player.car) check(player.x, player.z, 7)
    if (c.wait < 5) for (const o of cars) if (o !== c) check(o.x, o.z, 8.5)
    c.wait = blocked ? c.wait + dt : c.wait > 5 ? (c.wait > 7 ? 0 : c.wait + dt) : 0
    const target = blocked ? 0 : Math.abs(diff) > 0.4 ? 5 : 9.5
    c.speed += clamp(target - c.speed, -26 * dt, 6 * dt)
    c.yaw += clamp(diff, -2.6 * dt, 2.6 * dt) * clamp(c.speed / 3, 0, 1)
    c.x += Math.sin(c.yaw) * c.speed * dt
    c.z += Math.cos(c.yaw) * c.speed * dt
}

// ---------------------------------------------------------------- people on the pavements
const peds = []
function pedPos(p, out) {
    const t = ((p.t % 160) + 160) % 160, side = Math.floor(t / 40), u = (t % 40) - 20
    const b = p.block
    if (side === 0) { out.x = b.cx + u; out.z = b.cz - 20 }
    else if (side === 1) { out.x = b.cx + 20; out.z = b.cz + u }
    else if (side === 2) { out.x = b.cx - u; out.z = b.cz + 20 }
    else { out.x = b.cx - 20; out.z = b.cz - u }
}
{
    const walkable = world.blocks.filter((b) => b.type !== 'turf')
    for (let i = 0; i < 26; i++) {
        const block = walkable[(i * 7) % walkable.length]
        const cop = block.type === 'station' && i % 2 === 0
        const person = makePerson(cop
            ? { shirt: 0x2f5fd0, pants: 0x1f2a44, cap: 0x1f2a44, skin: SKINS[i % 4] }
            : { shirt: PED_SHIRTS[i % 8], pants: [0x3d4f6b, 0x5a4a3f, 0x2b2f3a][i % 3], skin: SKINS[i % 4], hair: [0x3a2a20, 0x1b1b1b, 0xb8863b][i % 3] })
        scene.add(person.group)
        const p = { block, t: Math.random() * 160, dir: i % 2 ? 1 : -1, pace: rand(1.2, 1.9), flee: 0, hop: 0, vy: 0, cop, person, x: 0, z: 0, yaw: 0, cd: 0 }
        pedPos(p, p)
        peds.push(p)
    }
}
function scarePed(p, color) {
    p.flee = 4
    if (p.hop <= 0) p.vy = 4.5
    if (color !== undefined) p.person.setShirt(color)
}
function updatePeds(dt) {
    for (const p of peds) {
        const speed = p.flee > 0 ? 5.5 : p.pace
        p.flee -= dt
        p.cd -= dt
        const ox = p.x, oz = p.z
        p.t += p.dir * speed * dt
        pedPos(p, p)
        if (p.x !== ox || p.z !== oz) p.yaw = turnTo(p.yaw, Math.atan2(p.x - ox, p.z - oz), dt * 10)
        p.vy -= 18 * dt
        p.hop = Math.max(0, p.hop + p.vy * dt)
        if (p.hop === 0) p.vy = 0
        const g = p.person.group
        g.position.set(p.x, groundY(p.x, p.z) + p.hop, p.z)
        g.rotation.y = p.yaw
        p.person.shadow.position.y = 0.03 - p.hop
        p.person.animate(dt, speed)
    }
}

// ---------------------------------------------------------------- effects
const PCOUNT = 260
const pPos = new Float32Array(PCOUNT * 3).fill(-100), pCol = new Float32Array(PCOUNT * 3)
const pVel = new Float32Array(PCOUNT * 3), pLife = new Float32Array(PCOUNT)
const pGeo = new THREE.BufferGeometry()
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3))
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.32, vertexColors: true }))
particles.frustumCulled = false
scene.add(particles)
let pNext = 0
const tmpColor = new THREE.Color()
function burst(x, y, z, color, n = 10, power = 4) {
    tmpColor.setHex(color)
    for (let i = 0; i < n; i++) {
        const k = pNext * 3
        pNext = (pNext + 1) % PCOUNT
        pPos[k] = x; pPos[k + 1] = y; pPos[k + 2] = z
        pVel[k] = rand(-1, 1) * power; pVel[k + 1] = rand(0.3, 1.2) * power; pVel[k + 2] = rand(-1, 1) * power
        pCol[k] = tmpColor.r; pCol[k + 1] = tmpColor.g; pCol[k + 2] = tmpColor.b
        pLife[k / 3] = rand(0.4, 0.8)
    }
}
function updateParticles(dt) {
    for (let i = 0; i < PCOUNT; i++) {
        if (pLife[i] <= 0) continue
        const k = i * 3
        pLife[i] -= dt
        pVel[k + 1] -= 14 * dt
        pPos[k] += pVel[k] * dt; pPos[k + 1] += pVel[k + 1] * dt; pPos[k + 2] += pVel[k + 2] * dt
        if (pLife[i] <= 0) pPos[k + 1] = -100
    }
    pGeo.attributes.position.needsUpdate = true
    pGeo.attributes.color.needsUpdate = true
}

// paint splats on the ground
const decals = []
{
    const g = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2)
    for (let i = 0; i < 36; i++) {
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
        m.visible = false
        scene.add(m)
        decals.push({ m, life: 0 })
    }
}
let decalNext = 0
function splat(x, y, z, color, size = 0.7) {
    burst(x, y, z, color, 8, 3.5)
    if (y - groundY(x, z) > 0.6) return
    const d = decals[decalNext]
    decalNext = (decalNext + 1) % decals.length
    d.life = 14
    d.m.visible = true
    d.m.material.color.setHex(color)
    d.m.position.set(x, groundY(x, z) + 0.04, z)
    d.m.scale.setScalar(size * rand(0.8, 1.2))
}
function updateDecals(dt) {
    for (const d of decals) {
        if (d.life <= 0) continue
        d.life -= dt
        d.m.material.opacity = Math.min(0.85, d.life * 0.4)
        if (d.life <= 0) d.m.visible = false
    }
}

// ---------------------------------------------------------------- paint blobs
const shots = []
{
    const g = new THREE.SphereGeometry(0.17, 8, 6)
    for (let i = 0; i < 56; i++) {
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial())
        m.visible = false
        scene.add(m)
        shots.push({ m, live: false })
    }
}
function shoot(owner, x, y, z, dx, dy, dz, spec) {
    const s = shots.find((q) => !q.live)
    if (!s) return
    Object.assign(s, { live: true, owner, x, y, z, vx: dx * spec.speed, vy: dy * spec.speed, vz: dz * spec.speed, life: 2.2, dmg: spec.dmg, splash: spec.splash || 0, grav: spec.grav, color: spec.color })
    s.m.material.color.setHex(spec.color)
    s.m.scale.setScalar(spec.splash ? 2.2 : 1)
    s.m.visible = true
}
function endShot(s, hitSomeone) {
    s.live = false
    s.m.visible = false
    splat(s.x, s.y, s.z, s.color, s.splash ? 2.4 : 0.7)
    if (!hitSomeone) audio.play('splat')
    if (s.splash && s.owner === 'player') {
        burst(s.x, s.y + 0.5, s.z, s.color, 30, 8)
        for (const e of gang) if (e.state !== 'down' && dist(e.x, e.z, s.x, s.z) < s.splash) hurtGang(e, s.dmg * 0.6)
        for (const c of cops) if (dist(c.x, c.z, s.x, s.z) < s.splash) stunCop(c)
        for (const p of peds) if (dist(p.x, p.z, s.x, s.z) < s.splash) paintPed(p, s.color)
    }
}
function updateShots(dt) {
    for (const s of shots) {
        if (!s.live) continue
        const steps = Math.max(1, Math.ceil((Math.hypot(s.vx, s.vy, s.vz) * dt) / 0.5)), h = dt / steps
        s.life -= dt
        for (let n = 0; n < steps && s.live; n++) {
            s.vy -= s.grav * h
            s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h
            if (s.life <= 0 || s.y <= groundY(s.x, s.z) + 0.05 || world.solidAt(s.x, s.z, s.y)) { endShot(s, false); break }
            let hit = false
            for (const c of cars) {
                if (c === player.car && s.owner === 'player') continue
                if (s.y < 1.7 && dist(c.x, c.z, s.x, s.z) < 1.5) {
                    hit = true
                    if (c.kind === 'traffic' && s.owner === 'player') offence(4, 'Hey! That was a clean car!')
                    break
                }
            }
            if (!hit && s.owner === 'player') {
                for (const e of gang) {
                    if (e.state !== 'down' && dist(e.x, e.z, s.x, s.z) < 0.6 * e.scale && s.y < e.y + 2 * e.scale) { hurtGang(e, s.dmg); hit = true; break }
                }
                if (!hit) for (const c of cops) if (dist(c.x, c.z, s.x, s.z) < 0.6 && s.y < 2.2) { stunCop(c); hit = true; break }
                if (!hit) for (const p of peds) if (dist(p.x, p.z, s.x, s.z) < 0.6 && s.y < 2.2) { paintPed(p, s.color); hit = true; break }
            } else if (!hit && s.owner === 'enemy' && !player.car) {
                if (dist(player.x, player.z, s.x, s.z) < 0.55 && s.y > player.y && s.y < player.y + 1.95) { hurtPlayer(s.dmg); hit = true }
            }
            if (hit) endShot(s, true)
        }
        if (s.live) s.m.position.set(s.x, s.y, s.z)
    }
}

// ---------------------------------------------------------------- heat and the police
const cops = []
const heatLevel = () => (G.heat <= 0 ? 0 : Math.min(5, 1 + Math.floor(G.heat / 20)))
function offence(points, message) {
    G.heat = Math.min(100, G.heat + points)
    G.lastOffence = G.time
    if (message) ui.toast(message)
}
function paintPed(p, color) {
    scarePed(p, color)
    audio.play('splat')
    if (p.cd > 0) return
    p.cd = 1.5
    offence(p.cop ? 22 : 12, p.cop ? 'You painted an officer! Run!' : 'Hey! Watch where you aim!')
}
function stunCop(c) {
    if (c.stun <= 0) offence(18, 'Officer painted! They will not like that.')
    c.stun = 3
    audio.play('splat')
}
function randomNodeNear(min, max) {
    const options = []
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const d = dist(nodePos(i), nodePos(j), player.x, player.z)
        if (d > min && d < max) options.push([i, j])
    }
    return options.length ? options[Math.floor(Math.random() * options.length)] : null
}
// Where to head next when chasing: straight at the target if visible, otherwise along the streets.
function chaseTarget(e, gx, gz, out) {
    const d = dist(e.x, e.z, gx, gz)
    if (d < 34 && !world.blocked(e.x, e.z, gx, gz)) { e.node = null; out.x = gx; out.z = gz; return }
    if (!e.node || dist(e.x, e.z, nodePos(e.node[0]), nodePos(e.node[1])) < 4) {
        const ci = nearestNode(e.x), cj = nearestNode(e.z), gi = nearestNode(gx), gj = nearestNode(gz)
        if (!e.node && dist(e.x, e.z, nodePos(ci), nodePos(cj)) > 4) e.node = [ci, cj]
        else if (ci === gi && cj === gj) { out.x = gx; out.z = gz; return }
        else if (Math.abs(gi - ci) >= Math.abs(gj - cj)) e.node = [ci + Math.sign(gi - ci), cj]
        else e.node = [ci, cj + Math.sign(gj - cj)]
    }
    out.x = nodePos(e.node[0])
    out.z = nodePos(e.node[1])
}
function spawnCop() {
    const n = randomNodeNear(48, 100) || randomNodeNear(30, 400)
    if (!n) return
    const person = makePerson({ shirt: 0x2f5fd0, pants: 0x1f2a44, cap: 0x1f2a44, skin: SKINS[cops.length % 4] })
    scene.add(person.group)
    cops.push({ x: nodePos(n[0]), z: nodePos(n[1]), yaw: 0, person, stun: 0, leave: 0, node: null })
}
function spawnPoliceCar() {
    const n = randomNodeNear(60, 130) || randomNodeNear(30, 400)
    if (!n) return
    const c = addCar('police', nodePos(n[0]), nodePos(n[1]), 0)
    c.chasing = true
}
const goal = { x: 0, z: 0 }
function updatePolice(dt) {
    const level = heatLevel()
    const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z
    const pSpeed = Math.abs(player.car ? player.car.speed : player.speed)
    let seen = false, closing = false
    const policeCars = cars.filter((c) => c.kind === 'police' && c.chasing)

    if (level > 0) {
        G.copTimer -= dt
        if (G.copTimer <= 0) {
            G.copTimer = 2.5
            if (cops.filter((c) => !c.leave).length < [0, 1, 2, 2, 2, 3][level]) spawnCop()
            else if (policeCars.length < [0, 0, 0, 1, 2, 3][level]) spawnPoliceCar()
        }
    }
    for (let i = cops.length - 1; i >= 0; i--) {
        const c = cops[i], d = dist(c.x, c.z, px, pz)
        let speed = 0
        if (level === 0 && !c.leave) c.leave = 0.01
        if (c.stun > 0) {
            c.stun -= dt
            c.yaw += dt * 9
            if (Math.random() < dt * 8) burst(c.x, 2.2, c.z, 0xffd23f, 1, 1.5)
        } else if (c.leave) {
            c.leave += dt
            chaseTarget(c, c.x + (c.x - px), c.z + (c.z - pz), goal)
            speed = 3
            if (c.leave > 12 || d > 60) { scene.remove(c.person.group); cops.splice(i, 1); continue }
        } else {
            chaseTarget(c, px, pz, goal)
            speed = d > 1.2 ? 6.7 : 0
            if (d < 35) seen = true
            if (d < (player.car ? 2.8 : 1.7) && pSpeed < 3.5) closing = true
        }
        if (speed) {
            const want = Math.atan2(goal.x - c.x, goal.z - c.z)
            c.yaw = turnTo(c.yaw, want, dt * 9)
            c.x += Math.sin(want) * speed * dt
            c.z += Math.cos(want) * speed * dt
            world.resolve(c, 0.4)
        }
        const g = c.person.group
        g.position.set(c.x, groundY(c.x, c.z), c.z)
        g.rotation.y = c.yaw
        c.person.animate(dt, speed)
    }
    for (const c of policeCars) {
        const d = dist(c.x, c.z, px, pz)
        if (level === 0) {       // chase over: join the traffic and drive away
            c.chasing = false
            const i = nearestNode(c.x), j = nearestNode(c.z)
            startRoute(c, i, j, pickDir(i, j, Math.floor(Math.random() * 4)))
            c.patrol = 0
            continue
        }
        chaseTarget(c, px, pz, goal)
        const diff = wrap(Math.atan2(goal.x - c.x, goal.z - c.z) - c.yaw)
        let target = d < 6 ? 3 : Math.abs(diff) > 0.9 ? 8 : 21
        if (c.reverse > 0) { c.reverse -= dt; target = -6 }
        c.speed += clamp(target - c.speed, -24 * dt, 11 * dt)
        c.yaw += clamp(diff, -2.4 * dt, 2.4 * dt) * clamp(Math.abs(c.speed) / 4, 0.25, 1) * Math.sign(c.speed || 1)
        c.x += Math.sin(c.yaw) * c.speed * dt
        c.z += Math.cos(c.yaw) * c.speed * dt
        const hit = carVsWorld(c)
        for (const o of cars) if (o !== c && carVsCar(c, o) && c.speed > 4) c.speed *= 0.5
        if (hit === 2) c.speed *= 0.4
        c.stuck = Math.abs(c.speed) < 1.5 && d > 8 ? c.stuck + dt : 0
        if (c.stuck > 0.9) { c.reverse = 1.3; c.stuck = 0 }
        if (d < 40) seen = true
        if (d < 4.6 && pSpeed < 3.5) closing = true
    }
    // police cars that gave up drive off, then disappear once out of sight
    for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i]
        if (c.kind !== 'police' || c.chasing) continue
        c.patrol += dt
        if (c.patrol > 6 && dist(c.x, c.z, px, pz) > 75) removeCar(c)
    }

    if (level > 0 && !seen && G.time - G.lastOffence > 4) G.heat = Math.max(0, G.heat - 5 * dt)
    G.bust = clamp(G.bust + (closing ? dt / 1.1 : -dt * 0.8), 0, 1)
    if (G.bust >= 1) busted()
    audio.setSiren(level > 0 && seen ? 1 : 0)
}

// ---------------------------------------------------------------- Gonzalves and his crew
const gang = []
function spawnGang(crewCount, withBoss) {
    clearGang()
    const add = (x, z, boss) => {
        const person = makePerson(boss
            ? { shirt: 0x7a2e8a, pants: 0x2b2f3a, cap: 0xf2c14e, skin: SKINS[1], scale: 1.3 }
            : { shirt: 0xd2553f, pants: 0x2b2f3a, cap: 0x2b2f3a, skin: SKINS[gang.length % 4] })
        person.setTool(ENEMY_PAINT)
        scene.add(person.group)
        const e = { x, z, y: 0, yaw: Math.PI, home: [x, z], person, boss, scale: boss ? 1.3 : 1, hp: boss ? 120 : 40, max: boss ? 120 : 40, state: 'idle', cd: rand(0.5, 2), side: 1, sideT: 0, downT: 0, label: null }
        if (boss) {
            e.label = makeLabel('GONZALVES', { color: '#ffd23f', scale: 0.7 })
            scene.add(e.label)
        }
        world.resolve(e, 0.5)
        gang.push(e)
    }
    for (let i = 0; i < crewCount; i++) add(...poi.turf.crew[i % poi.turf.crew.length], false)
    if (withBoss) add(...poi.turf.boss, true)
}
function clearGang() {
    for (const e of gang) {
        scene.remove(e.person.group)
        if (e.label) scene.remove(e.label)
    }
    gang.length = 0
}
function hurtGang(e, dmg) {
    if (e.state === 'down') return
    e.hp -= dmg
    e.state = 'fight'
    for (const o of gang) if (o.state === 'idle') o.state = 'fight'
    burst(e.x, 1.3 * e.scale, e.z, GADGETS[Math.max(0, G.gadget)].color, 6, 3)
    audio.play('splat')
    if (e.hp > 0) return
    e.state = 'down'
    e.downT = 0
    e.person.setTool(null)
    audio.play('down')
}
function updateGang(dt) {
    const px = player.car ? player.car.x : player.x, pz = player.car ? player.car.z : player.z
    for (let i = gang.length - 1; i >= 0; i--) {
        const e = gang[i], g = e.person.group, d = dist(e.x, e.z, px, pz)
        let speed = 0
        if (e.state === 'down') {
            e.downT += dt
            g.rotation.x = -Math.min(1, e.downT * 4) * Math.PI / 2
            g.position.y = groundY(e.x, e.z) + 0.25 * e.scale
            if (Math.random() < dt * 6) burst(e.x, 1, e.z, 0xffd23f, 1, 1.5)
            if (e.downT > 2.2) {
                burst(e.x, 0.8, e.z, 0xffffff, 16, 4)
                scene.remove(g)
                if (e.label) scene.remove(e.label)
                gang.splice(i, 1)
                if (e.boss && G.mission === 3) completeMission(4)
                else if (G.bountyActive && !gang.length) bountyDone()
            }
            continue
        }
        const turfDist = dist(px, pz, poi.turf.x, poi.turf.z)
        if (e.state === 'idle' && d < 24 && !world.blocked(e.x, e.z, px, pz)) e.state = 'fight'
        if (e.state === 'fight' && turfDist > 60) { e.state = 'idle'; e.hp = e.max }
        if (e.state === 'fight') {
            const to = Math.atan2(px - e.x, pz - e.z)
            e.yaw = turnTo(e.yaw, to, dt * 8)
            e.sideT -= dt
            if (e.sideT <= 0) { e.sideT = rand(1.2, 3); e.side = Math.random() < 0.5 ? -1 : 1 }
            let mx = Math.cos(to) * e.side * 0.8, mz = -Math.sin(to) * e.side * 0.8
            if (d > 15) { mx += Math.sin(to); mz += Math.cos(to) } else if (d < 8) { mx -= Math.sin(to); mz -= Math.cos(to) }
            // stay on the turf
            const hd = dist(e.x, e.z, poi.turf.x, poi.turf.z)
            if (hd > 24) { mx = (poi.turf.x - e.x) / hd; mz = (poi.turf.z - e.z) / hd }
            speed = e.boss ? 2.6 : 3.2
            const m = Math.hypot(mx, mz) || 1
            e.x += (mx / m) * speed * dt
            e.z += (mz / m) * speed * dt
            world.resolve(e, 0.45 * e.scale)
            e.cd -= dt
            if (e.cd <= 0 && d < 34 && !world.blocked(e.x, e.z, px, pz, 2.2)) {
                e.cd = e.boss ? rand(0.9, 1.3) : rand(1.5, 2.4)
                const speedShot = 17, t = d / speedShot
                const lead = player.car ? 0 : 0.6
                const tx = px + player.vx * t * lead + rand(-1, 1) * d * 0.07, tz = pz + player.vz * t * lead + rand(-1, 1) * d * 0.07
                const hx = tx - e.x, hz = tz - e.z, hl = Math.hypot(hx, hz) || 1
                const spec = { speed: speedShot, dmg: e.boss ? 16 : 9, grav: 6, color: ENEMY_PAINT }
                const fan = e.boss && e.hp < e.max / 2 ? [-0.16, 0, 0.16] : [0]
                for (const a of fan) {
                    const ca = Math.cos(a), sa = Math.sin(a), dx = (hx * ca - hz * sa) / hl, dz = (hx * sa + hz * ca) / hl
                    shoot('enemy', e.x + dx * 0.6, 1.45 * e.scale, e.z + dz * 0.6, dx, 0.02 + (t * 6) / (2 * speedShot) * 1, dz, spec)
                }
                audio.play('pop')
            }
        } else if (dist(e.x, e.z, e.home[0], e.home[1]) > 1) {
            const to = Math.atan2(e.home[0] - e.x, e.home[1] - e.z)
            e.yaw = turnTo(e.yaw, to, dt * 6)
            speed = 2.4
            e.x += Math.sin(to) * speed * dt
            e.z += Math.cos(to) * speed * dt
            world.resolve(e, 0.45)
        }
        g.position.set(e.x, groundY(e.x, e.z), e.z)
        g.rotation.y = e.yaw
        e.person.animate(dt, speed, e.state === 'fight')
        if (e.label) e.label.position.set(e.x, 2.9 * e.scale, e.z)
    }
}

// ---------------------------------------------------------------- pickups and markers
const coins = world.coinSpots.map(([x, z]) => {
    const o = { x, z }
    world.resolve(o, 0.8)
    return { x: o.x, z: o.z, back: 0 }
})
const coinMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x7a5a00 }), coins.length)
coinMesh.frustumCulled = false
scene.add(coinMesh)
const dummy = new THREE.Object3D()

const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }))
beam.visible = false
scene.add(beam)
const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.12, 20), new THREE.MeshBasicMaterial({ color: 0x4fb3e8, transparent: true, opacity: 0.8 }))
pad.position.set(poi.hideout.save[0], 0.26, poi.hideout.save[1])
scene.add(pad)
const saveLabel = makeLabel('SAVE', { color: '#7ee8fa', scale: 0.7 })
saveLabel.position.set(poi.hideout.save[0], 2.4, poi.hideout.save[1])
scene.add(saveLabel)

const frank = makePerson({ shirt: 0x4a4f5a, pants: 0x2b2f3a, skin: SKINS[0], hair: 0x9a9a9a })
frank.group.position.set(poi.station.frank[0], 0.18, poi.station.frank[1])
scene.add(frank.group)
const frankLabel = makeLabel('FRANK', { color: '#7dfc8a', scale: 0.7 })
frankLabel.position.set(poi.station.frank[0], 2.7, poi.station.frank[1])
scene.add(frankLabel)

const stands = poi.hideout.stands.map(([x, z], i) => {
    const g = GADGETS[i]
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 1), new THREE.MeshLambertMaterial({ color: 0x5c3b2a }))
    base.position.set(x, 0.63, z)
    const item = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.9), new THREE.MeshLambertMaterial({ color: g.color, emissive: g.color, emissiveIntensity: 0.25 }))
    item.position.set(x, 1.55, z)
    const label = makeLabel(g.price ? `${g.name}  $${g.price}` : g.name, { scale: 0.55 })
    label.position.set(x, 2.5, z)
    scene.add(base, item, label)
    return { x, z, item, label }
})

function objective() {
    if (G.mission === 0) return poi.hideout.save
    if (G.mission === 1) return poi.station.frank
    if (G.mission === 2) return poi.hideout.stands[0]
    if (G.mission === 3 || G.bountyActive) return [poi.turf.x, poi.turf.z - 6]
    return null
}

// ---------------------------------------------------------------- saving
function save() {
    const x = player.car ? player.car.x : player.x, z = player.car ? player.car.z : player.z
    store.set('save', JSON.stringify({ v: 1, money: G.money, mission: G.mission, owned: G.owned, gadget: G.gadget, bounty: G.bounty, x, z }))
}
function readSave() {
    try {
        const d = JSON.parse(store.get('save'))
        return d && d.v === 1 && Number.isFinite(d.money) && Array.isArray(d.owned) ? d : null
    } catch { return null }
}

function resetRun() {
    for (const c of cops) scene.remove(c.person.group)
    cops.length = 0
    for (const c of cars.filter((o) => o.kind === 'police')) removeCar(c)
    for (const c of cars) if (c.kind === 'crew') { [c.x, c.z, c.yaw] = c.home; c.speed = 0 }
    for (const s of shots) { s.live = false; s.m.visible = false }
    for (const c of coins) c.back = 0
    clearGang()
    Object.assign(G, { time: 0, heat: 0, lastOffence: -99, bust: 0, bountyActive: false, rematchAt: Infinity, userPaused: false, mapOpen: false, shake: 0, hurtFlash: 0, onPad: true })
    Object.assign(player, { car: null, health: MAX_HEALTH, vy: 0, speed: 0, vx: 0, vz: 0, reload: 0, fireCd: 0, aimT: 0 })
    player.person.group.visible = true
}
function placePlayer(x, z, yaw) {
    player.x = x
    player.z = z
    world.resolve(player, 0.45)
    player.y = groundY(player.x, player.z)
    player.yaw = cam.yaw = yaw
    cam.pitch = 0.3
}
function equip(i) {
    G.gadget = i
    player.mag = i >= 0 ? GADGETS[i].mag : 0
    player.reload = 0
    player.person.setTool(i >= 0 ? GADGETS[i].color : null)
}
function startGame(data) {
    resetRun()
    if (data) {
        Object.assign(G, { money: data.money, mission: clamp(data.mission | 0, 0, 4), owned: data.owned.slice(0, 4).map(Boolean), bounty: data.bounty | 0 })
        placePlayer(Number(data.x) || poi.start[0], Number(data.z) || poi.start[1], 0)
        equip(G.owned[data.gadget] ? data.gadget : G.owned.indexOf(true))
        G.mode = 'play'
        if (G.mission === 3) spawnGang(5, true)
        if (G.mission === 4) G.rematchAt = 60
    } else {
        Object.assign(G, { money: 1000, mission: 0, owned: [false, false, false, false], bounty: 0 })
        placePlayer(poi.start[0], poi.start[1], Math.PI / 2)
        equip(-1)
        G.mode = 'intro'
        G.introT = 0
        ui.caption('After years away, you step off the bus. Gonzalves runs this town now. Time to change that.', input.touch ? 'Tap to skip' : 'Press any key to skip')
    }
    ui.show('menu', false)
    ui.show('hud', G.mode === 'play')
    ui.show('touch', G.mode === 'play')
    input.clear()
}
function toMenu() {
    G.mode = 'menu'
    G.userPaused = false
    ui.closeModal()
    ui.caption('')
    ui.show('hud', false)
    ui.show('touch', false)
    ui.show('menu', true)
    document.getElementById('btn-continue').hidden = !readSave()
    audio.setEngine(false, 0)
    audio.setSiren(0)
}

// ---------------------------------------------------------------- pop-ups, ads, missions
// Every ad sits behind a pop-up at a natural break, so play is already stopped.
async function adThen(type, buttons, after) {
    for (const b of buttons) b.disabled = true
    input.clear()
    const result = await platform.ad(type)
    input.clear()
    for (const b of buttons) b.disabled = false
    after(result)
}
const allButtons = () => [...document.querySelectorAll('#modal-buttons button')]

function completeMission(n) {
    if (G.mission >= n || G.mode !== 'play') return
    G.mission = n
    const reward = [0, 0, 600, 0, 2000][n]
    G.money += reward
    const text = [
        '',
        'Home sweet hideout. Your game is saved here whenever you step on the blue pad.\n\nNext: Frank has news for you at the police station. Grab a crew car (the dark ones with blue stripes) to get there faster.',
        'Frank: "Gonzalves and his crew have taken over the scrapyard. No real trouble, just make a mess of him."\n\nYou earned $600. There is a Paint Popper waiting at your hideout.',
        'Paint Popper ready! Hold fire to shoot paint. More gadgets are for sale on the stands next to it.\n\nNow find Gonzalves at the scrapyard in the far corner of town.',
        `Gonzalves and his crew are covered in paint and gone for good. You earned $2,000!\n\nFinal cash: $${G.money.toLocaleString('en-US')}. Keep roaming: the crew will try to sneak back for bonus cash.`,
    ][n]
    if (n === 3) { G.owned[0] = true; equip(0); spawnGang(5, true) }
    if (n === 4) { G.rematchAt = G.time + 120; for (const e of gang) if (e.state !== 'down') hurtGang(e, 999) }
    save()
    platform.score(G.money)
    audio.play(n === 4 ? 'win' : 'save')
    ui.modal(n === 4 ? 'TOWN CLEANED UP!' : 'MISSION COMPLETE', text, [{
        label: n === 4 ? 'KEEP PLAYING' : 'CONTINUE', kind: 'primary',
        onClick: () => adThen('interstitial', allButtons(), () => ui.closeModal()),
    }])
}
function bountyDone() {
    if (!G.bountyActive) return
    G.bountyActive = false
    G.bounty++
    G.money += 500
    G.rematchAt = G.time + 120
    save()
    platform.score(G.money)
    audio.play('win')
    ui.modal('CREW CHASED OFF!', `Bonus job ${G.bounty} done. You earned $500.\n\nThey will be back, and they will bring friends.`, [{
        label: 'CONTINUE', kind: 'primary', onClick: () => adThen('interstitial', allButtons(), () => ui.closeModal()),
    }])
}
// Shared by "caught" and "splattered": pay up, or watch an ad to keep the cash.
function setback(title, body, cost, respawn) {
    let waived = false
    audio.setEngine(false, 0)
    audio.setSiren(0)
    const finish = () => {
        if (!waived) G.money = Math.max(0, G.money - cost)
        for (const c of cops) scene.remove(c.person.group)
        cops.length = 0
        for (const c of cars.filter((o) => o.kind === 'police')) removeCar(c)
        for (const s of shots) { s.live = false; s.m.visible = false }
        for (const e of gang) { e.state = 'idle'; e.hp = e.max; [e.x, e.z] = e.home }
        Object.assign(G, { heat: 0, bust: 0, hurtFlash: 0 })
        if (player.car) { player.car.speed = 0; player.car = null; player.person.group.visible = true }
        player.health = MAX_HEALTH
        placePlayer(respawn[0], respawn[1], 0)
        platform.score(G.money)
        ui.closeModal()
    }
    ui.modal(title, body, [
        { label: 'CONTINUE', kind: 'primary', onClick: () => (waived ? finish() : adThen('interstitial', allButtons(), finish)) },
        {
            label: `▶ WATCH AD: KEEP YOUR $${cost}`, kind: 'ad',
            onClick: (btn) => adThen('rewarded', allButtons(), ({ rewarded }) => {
                if (rewarded) {
                    waived = true
                    btn.hidden = true
                    ui.setModalBody('Thanks for watching! You keep your cash.')
                } else {
                    btn.disabled = true
                    btn.textContent = 'NO AD AVAILABLE RIGHT NOW'
                }
            }),
        },
    ])
}
function busted() {
    audio.play('bust')
    setback('CAUGHT!', 'The police caught up with you. You are let off with a telling-off and a $200 fine.', 200, poi.station.spawn)
}
function hurtPlayer(dmg) {
    player.health -= dmg
    player.lastHurt = G.time
    G.hurtFlash = 1
    G.shake = 0.25
    audio.play('hurt')
    if (player.health > 0) return
    audio.play('down')
    setback('SPLATTERED!', 'You are covered in paint from head to toe. The cleaning bill is $100.', 100, G.mission > 0 ? poi.hideout.spawn : poi.start)
}
function openPause() {
    if (G.mode !== 'play' || ui.modalOpen) return
    G.userPaused = true
    const muteLabel = () => (audio.muted ? 'SOUND: OFF' : 'SOUND: ON')
    ui.modal('PAUSED', HELP, [
        { label: 'RESUME', kind: 'primary', onClick: closePause },
        { label: muteLabel(), onClick: (btn) => { toggleMute(); btn.textContent = muteLabel() } },
        { label: 'QUIT TO MENU', onClick: toMenu },
    ])
}
function closePause() {
    G.userPaused = false
    ui.closeModal()
    input.clear()
}
function toggleMute() {
    audio.setMuted(!audio.muted)
    store.set('muted', audio.muted ? '1' : '0')
    document.getElementById('btn-mute').classList.toggle('off', audio.muted)
}
function mapMarkers() {
    const m = [
        { x: poi.hideout.x, z: poi.hideout.z, color: '#f2c14e', square: true, text: 'H', r: 5 },
        { x: poi.station.x, z: poi.station.z, color: '#5b8def', square: true, text: 'P', r: 5 },
    ]
    if (G.mission >= 3) m.push({ x: poi.turf.x, z: poi.turf.z, color: '#d2553f', square: true, text: 'G', r: 5 })
    for (const c of cars) {
        if (c.kind === 'crew' && c !== player.car) m.push({ x: c.x, z: c.z, color: '#22d3ee', r: 2.6 })
        if (c.kind === 'police' && c.chasing) m.push({ x: c.x, z: c.z, color: '#e5383b', r: 3.2 })
    }
    for (const c of cops) if (!c.leave) m.push({ x: c.x, z: c.z, color: '#e5383b', r: 2.6 })
    const o = objective()
    if (o) m.push({ x: o[0], z: o[1], color: '#ffd23f', r: 5, text: '!', clamp: true })
    return m
}
function toggleMap() {
    if (G.mode !== 'play' || (ui.modalOpen && !G.mapOpen)) return
    G.mapOpen = !G.mapOpen
    ui.show('map', G.mapOpen)
    input.clear()
    if (G.mapOpen) {
        const x = player.car ? player.car.x : player.x, z = player.car ? player.car.z : player.z
        ui.drawBigMap(world.mapCanvas, world.mapXY, x, z, player.car ? player.car.yaw : player.yaw, mapMarkers())
    }
}

// ---------------------------------------------------------------- the player
const aim = new THREE.Vector3(), camDir = new THREE.Vector3(), v3 = new THREE.Vector3()
function fire() {
    const g = GADGETS[G.gadget]
    const mx = player.x + Math.sin(cam.yaw) * 0.5, my = player.y + 1.4, mz = player.z + Math.cos(cam.yaw) * 0.5
    camera.getWorldDirection(camDir)
    aim.copy(camera.position).addScaledVector(camDir, 45)
    // aim assist: snap to the crew member closest to the crosshair
    let best = input.touch ? 0.86 : 0.975
    for (const e of gang) {
        if (e.state === 'down') continue
        v3.set(e.x, 1.2 * e.scale, e.z).sub(camera.position)
        const d = v3.length(), dot = v3.dot(camDir) / d
        if (d < 55 && dot > best) { best = dot; aim.set(e.x, 1.2 * e.scale + d * 0.012, e.z) }
    }
    aim.x -= mx; aim.y -= my; aim.z -= mz
    aim.normalize()
    for (let i = 0; i < g.pellets; i++) {
        shoot('player', mx, my, mz, aim.x + rand(-1, 1) * g.spread, aim.y + rand(-1, 1) * g.spread * 0.6 + 0.012, aim.z + rand(-1, 1) * g.spread, g)
    }
    audio.play(g.splash ? 'launch' : 'pop')
    player.fireCd = 1 / g.rate
    player.aimT = 0.6
    if (--player.mag <= 0) { player.reload = g.reload; audio.play('reload') }
}
function nearestCrewCar() {
    let best = null, bd = 3.8
    for (const c of cars) {
        if (c.kind !== 'crew') continue
        const d = dist(c.x, c.z, player.x, player.z)
        if (d < bd) { bd = d; best = c }
    }
    return best
}
function exitCar() {
    const c = player.car
    if (Math.abs(c.speed) > 5) { ui.toast('Slow down first!'); return }
    const s = Math.sin(c.yaw), k = Math.cos(c.yaw)
    const spots = [[c.x + k * 2.1, c.z - s * 2.1], [c.x - k * 2.1, c.z + s * 2.1], [c.x - s * 3.4, c.z - k * 3.4]]
    let spot = spots[0]
    for (const p of spots) {
        tmp.x = p[0]; tmp.z = p[1]
        if (!world.resolve(tmp, 0.5)) { spot = p; break }
    }
    c.speed = 0
    player.car = null
    player.person.group.visible = true
    player.x = spot[0]
    player.z = spot[1]
    world.resolve(player, 0.45)
    player.y = groundY(player.x, player.z)
    player.yaw = c.yaw
    audio.play('door')
}

function updateOnFoot(dt) {
    const f = Math.sin(cam.yaw), fz = Math.cos(cam.yaw)
    let wx = f * input.my - fz * input.mx, wz = fz * input.my + f * input.mx
    const len = Math.hypot(wx, wz), mag = Math.min(1, len)
    const speed = (input.sprint ? 7.6 : 4.4) * mag
    if (len > 0.01) { wx /= len; wz /= len } else { wx = wz = 0 }
    player.vx = wx * speed
    player.vz = wz * speed
    if (mag > 0.01) player.yaw = turnTo(player.yaw, Math.atan2(wx, wz), dt * 12)
    player.x += player.vx * dt
    player.z += player.vz * dt
    player.speed = speed
    cam.yaw -= input.mx * 1.0 * dt       // walking sideways slowly swings the view round

    const ground = groundY(player.x, player.z), onGround = player.y <= ground + 0.02
    if (input.take('jump') && onGround) player.vy = 6.4
    player.vy -= 20 * dt
    player.y += player.vy * dt
    if (player.y <= ground) { player.y = ground; player.vy = 0 }
    world.resolve(player, 0.45)
    for (const c of cars) {
        if (dist(c.x, c.z, player.x, player.z) > 4.5) continue
        carCircles(c, circA)
        for (let i = 0; i < 4; i += 2) {
            const dx = player.x - circA[i], dz = player.z - circA[i + 1], d = Math.hypot(dx, dz)
            if (d < 1.45 && d > 0.001) { player.x += (dx / d) * (1.45 - d); player.z += (dz / d) * (1.45 - d) }
        }
    }

    // gadgets
    const g = GADGETS[G.gadget]
    if (g) {
        player.fireCd -= dt
        player.aimT -= dt
        if (player.reload > 0) {
            player.reload -= dt
            if (player.reload <= 0) player.mag = g.mag
        } else if (input.take('reload') && player.mag < g.mag) {
            player.reload = g.reload
            audio.play('reload')
        } else if (input.fire && player.fireCd <= 0) {
            fire()
        }
        if (input.fire || player.aimT > 0) player.yaw = turnTo(player.yaw, cam.yaw, dt * 18)
        if (input.take('swap')) {
            for (let n = 1; n <= 4; n++) {
                const i = (G.gadget + n) % 4
                if (G.owned[i]) { if (i !== G.gadget) { equip(i); audio.play('click') } break }
            }
        }
        for (let i = 0; i < 4; i++) if (input.take('slot' + i) && G.owned[i] && i !== G.gadget) equip(i)
    }

    const p = player.person
    p.group.position.set(player.x, player.y, player.z)
    p.group.rotation.y = player.yaw
    p.shadow.position.y = 0.03 - (player.y - ground)
    p.animate(dt, onGround ? speed : 0, !!g && (input.fire || player.aimT > 0))
}

function updateDriving(dt) {
    const c = player.car, thr = input.my, sign = Math.sign(c.speed)
    if (thr > 0) c.speed += (c.speed < 0 ? 30 : 13) * thr * dt
    else if (thr < 0) c.speed += (c.speed > 0 ? 30 : 9) * thr * dt
    else c.speed -= sign * Math.min(Math.abs(c.speed), 5 * dt)
    if (input.brake) c.speed -= sign * Math.min(Math.abs(c.speed), 26 * dt)
    c.speed = clamp(c.speed, -9, 27)
    const grip = clamp(Math.abs(c.speed) / 6, 0, 1) * (1 - 0.5 * Math.abs(c.speed) / 27)
    c.yaw -= input.mx * 2.5 * grip * Math.sign(c.speed) * dt * (input.brake ? 1.35 : 1)
    c.x += Math.sin(c.yaw) * c.speed * dt
    c.z += Math.cos(c.yaw) * c.speed * dt
    c.bumpCd -= dt
    const impact = Math.abs(c.speed)
    const hit = carVsWorld(c)
    if (hit === 2) c.speed *= -0.25
    else if (hit === 1) c.speed *= 1 - 1.5 * dt
    let bumped = hit === 2 && impact > 6
    for (const o of cars) {
        if (o === c || !carVsCar(c, o)) continue
        if (impact > 3) {
            c.speed *= -0.3
            bumped = true
            if (o.kind === 'traffic' && c.bumpCd <= 0) { offence(7, 'Careful! You bumped a car.'); audio.play('honk') }
        }
    }
    if (bumped && c.bumpCd <= 0) { c.bumpCd = 0.6; G.shake = 0.3; audio.play('bump') }
    for (const p of peds) {
        if (impact > 4 && p.cd <= 0 && dist(p.x, p.z, c.x, c.z) < 2.3) {
            p.cd = 2
            scarePed(p)
            offence(p.cop ? 16 : 9, 'Watch out for people!')
            audio.play('honk')
        } else if (impact > 7 && p.flee <= 0 && dist(p.x, p.z, c.x, c.z) < 9) {
            p.flee = 1.5
        }
    }
    player.x = c.x
    player.z = c.z
    player.y = 0
    player.vx = Math.sin(c.yaw) * c.speed
    player.vz = Math.cos(c.yaw) * c.speed
    player.speed = 0
    input.take('jump'); input.take('swap'); input.take('reload')
}

function updateCamera(dt) {
    if (input.lookX || input.lookY) {
        cam.yaw -= input.lookX * 0.0048
        cam.pitch = clamp(cam.pitch + input.lookY * 0.0034, -0.12, 1.1)
        cam.lastLook = G.time
    }
    const c = player.car, portrait = camera.aspect < 1
    if (c && G.time - cam.lastLook > 1 && c.speed > 1) cam.yaw = turnTo(cam.yaw, c.yaw, dt * 2.6)
    const armed = G.gadget >= 0 && !c
    const tx = c ? c.x : player.x, tz = c ? c.z : player.z, ty = (c ? 1.4 : player.y + 1.75)
    const f = Math.sin(cam.yaw), fz = Math.cos(cam.yaw)
    let want = (c ? 9 : 5.6) * (portrait ? 1.2 : 1), pitch = cam.pitch
    if (G.mode === 'intro') {
        const k = 1 - Math.pow(1 - clamp(G.introT / 4.5, 0, 1), 3)
        want += (1 - k) * 70
        pitch += (1 - k) * 0.75
    }
    // pull the camera in if a wall is in the way
    const cp = Math.cos(pitch), sp = Math.sin(pitch)
    let d = want
    for (let s = 1; s <= want; s += 0.5) {
        if (world.solidAt(tx - f * cp * s, tz - fz * cp * s, ty + sp * s)) { d = Math.max(0.8, s - 0.7); break }
    }
    cam.dist = d < cam.dist ? d : Math.min(d, cam.dist + dt * 12)
    const side = armed ? 0.55 : 0
    let sx = 0, sy = 0
    if (G.shake > 0) { G.shake -= dt; sx = rand(-1, 1) * G.shake * 0.5; sy = rand(-1, 1) * G.shake * 0.5 }
    camera.position.set(tx - f * cp * cam.dist + fz * side + sx, Math.max(0.5, ty + sp * cam.dist + sy), tz - fz * cp * cam.dist - f * side)
    camera.lookAt(tx + f * 5 + fz * side, ty + 0.1 - sp * 2.2, tz + fz * 5 - f * side)
}

// ---------------------------------------------------------------- per-frame updates
function updateAmbient(dt) {
    for (const c of cars) {
        if (c.route && !c.chasing) updateTraffic(c, dt)
        const g = c.model.group
        g.position.set(c.x, groundY(c.x, c.z), c.z)
        g.rotation.y = c.yaw
        if (c.model.lights) {
            const on = c.chasing && Math.floor(performance.now() / 180) % 2
            c.model.lights[0].visible = !c.chasing || !!on
            c.model.lights[1].visible = !c.chasing || !on
        }
    }
    updatePeds(dt)
    const t = performance.now() / 1000
    coins.forEach((c, i) => {
        dummy.position.set(c.x, c.back > 0 ? -50 : groundY(c.x, c.z) + 1 + Math.sin(t * 2 + i) * 0.12, c.z)
        dummy.rotation.y = t * 2.5 + i
        dummy.updateMatrix()
        coinMesh.setMatrixAt(i, dummy.matrix)
    })
    coinMesh.instanceMatrix.needsUpdate = true
    for (const s of stands) s.item.rotation.y = t * 1.5
    pad.material.opacity = 0.55 + Math.sin(t * 3) * 0.25
    updateParticles(dt)
    updateDecals(dt)
}

let frameCount = 0
function update(dt) {
    if (G.mode === 'intro') {
        G.introT += dt
        if (G.introT > 5 || (G.introT > 0.7 && input.any)) {
            G.mode = 'play'
            ui.caption('')
            ui.show('hud', true)
            ui.show('touch', true)
            ui.toast(input.touch ? 'Drag left side to move, right side to look' : 'WASD to move, drag the mouse to look', 5000)
            input.clear()
        }
        player.person.group.position.set(player.x, player.y, player.z)
        player.person.group.rotation.y = player.yaw
        player.person.animate(dt, 0)
        updateAmbient(dt)
        updateCamera(dt)
        return
    }

    // context action
    const car = player.car
    let near = null, buy = -1
    if (!car) {
        near = nearestCrewCar()
        if (!near && G.mission >= 3) {
            buy = stands.findIndex((s, i) => i > 0 && !G.owned[i] && dist(s.x, s.z, player.x, player.z) < 2.4)
        }
    }
    if (car) ui.hint('E', 'Get out', 'EXIT')
    else if (near) ui.hint('E', 'Drive', 'DRIVE')
    else if (buy > 0) ui.hint('E', `Buy ${GADGETS[buy].name} for $${GADGETS[buy].price}`, 'BUY')
    else ui.hint('', '', '')
    if (input.take('interact')) {
        if (car) exitCar()
        else if (near) {
            player.car = near
            player.person.group.visible = false
            cam.lastLook = -99
            audio.play('door')
        } else if (buy > 0) {
            if (G.money >= GADGETS[buy].price) {
                G.money -= GADGETS[buy].price
                G.owned[buy] = true
                equip(buy)
                save()
                audio.play('save')
                ui.toast(`${GADGETS[buy].name} bought and saved!`)
            } else {
                ui.toast('Not enough cash yet.')
            }
        }
    }

    if (player.car) updateDriving(dt)
    else updateOnFoot(dt)
    if (G.mode !== 'play' || ui.modalOpen) return     // a pop-up opened this frame

    updateAmbient(dt)
    updatePolice(dt)
    updateGang(dt)
    updateShots(dt)
    if (ui.modalOpen) return

    // health comes back when nobody has hit you for a while
    if (G.time - player.lastHurt > 6 && player.health < MAX_HEALTH) player.health = Math.min(MAX_HEALTH, player.health + 12 * dt)
    G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2)

    // coins
    for (const c of coins) {
        if (c.back > 0) { c.back -= dt; continue }
        if (dist(c.x, c.z, player.x, player.z) < (player.car ? 2.2 : 1.3)) {
            c.back = 90
            G.money += 25
            audio.play('coin')
            burst(c.x, 1.2, c.z, 0xffd23f, 8, 3)
        }
    }

    // places
    if (!player.car) {
        const onPad = dist(player.x, player.z, poi.hideout.save[0], poi.hideout.save[1]) < 1.7
        if (onPad && !G.onPad) {
            if (G.mission === 0) completeMission(1)
            else { save(); audio.play('save'); ui.toast('Game saved.') }
        }
        G.onPad = onPad
        if (G.mission === 1 && dist(player.x, player.z, poi.station.frank[0], poi.station.frank[1]) < 2.6) completeMission(2)
        if (G.mission === 2 && dist(player.x, player.z, stands[0].x, stands[0].z) < 1.9) completeMission(3)
    }
    stands.forEach((s, i) => { s.item.visible = s.label.visible = !G.owned[i] && (i > 0 || G.mission >= 2) })
    frankLabel.visible = G.mission === 1

    // bonus jobs after the story
    if (G.mission === 4 && !G.bountyActive && G.time > G.rematchAt && dist(player.x, player.z, poi.turf.x, poi.turf.z) > 70) {
        G.bountyActive = true
        spawnGang(Math.min(8, 5 + G.bounty), false)
        ui.toast('Bonus job: the crew is back at the scrapyard!', 4500)
    }

    const o = objective()
    beam.visible = !!o
    if (o) beam.position.set(o[0], 20, o[1])

    updateCamera(dt)
    const ratio = player.car ? Math.abs(player.car.speed) / 27 : 0
    audio.setEngine(!!player.car, ratio)

    // HUD
    const g = GADGETS[G.gadget], level = heatLevel()
    ui.health(player.health / MAX_HEALTH)
    ui.hurt(G.hurtFlash)
    ui.money(G.money)
    ui.heat(level, level > 0)
    ui.mission(G.bountyActive ? 'Bonus job: chase the crew out of the scrapyard again.' : MISSION_TEXT[G.mission])
    ui.meter('bust', G.bust)
    const boss = gang.find((e) => e.boss && e.state === 'fight')
    ui.meter('boss', boss ? boss.hp / boss.max : 0)
    ui.gadget(g && !player.car ? g.name : null, g ? (player.reload > 0 ? 'RELOAD' : `${player.mag} / ${g.mag}`) : '')
    ui.touchButtons({ swap: !player.car && G.owned.filter(Boolean).length > 1, jumpLabel: player.car ? 'BRAKE' : 'JUMP' })
    if (frameCount % 3 === 0) {
        ui.drawMinimap(world.mapCanvas, world.mapXY, player.x, player.z, player.car ? player.car.yaw : player.yaw, mapMarkers())
    }
}

// ---------------------------------------------------------------- menu, sizing, main loop
const HELP = input.touch
    ? 'Drag the left side to move, the right side to look around. Use the round buttons to jump, drive and fire. Tap the small map to open the big one.'
    : 'WASD or arrows: move and steer.  Drag mouse: look.  Left click or K: fire.\nSpace: jump / brake.  Shift: run.  E: drive, get out, buy.  Q: swap gadget.\nM: map.  Esc: pause.'
document.getElementById('help').textContent = HELP
document.getElementById('ver').textContent = `v${VERSION}`
document.getElementById('btn-continue').hidden = !readSave()
document.getElementById('btn-mute').classList.toggle('off', audio.muted)

const newBtn = document.getElementById('btn-new')
let confirmNew = false
newBtn.addEventListener('click', () => {
    if (readSave() && !confirmNew) {
        confirmNew = true
        newBtn.textContent = 'ERASE SAVE AND START?'
        return
    }
    confirmNew = false
    newBtn.textContent = 'NEW GAME'
    audio.play('click')
    startGame(null)
})
document.getElementById('btn-continue').addEventListener('click', () => { audio.play('click'); startGame(readSave()) })
document.getElementById('btn-pause').addEventListener('click', openPause)
document.getElementById('btn-mute').addEventListener('click', toggleMute)
document.getElementById('btn-map-close').addEventListener('click', toggleMap)
ui.el.minimap.addEventListener('click', toggleMap)

// Ad breaks: the site tells us when to stop and when to carry on.
platform.onPause((paused) => {
    G.adPaused = !!paused
    input.clear()
})
document.addEventListener('visibilitychange', () => { if (document.hidden) openPause() })

let viewW = 0, viewH = 0
function fit() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight
    if (w === viewW && h === viewH) return
    viewW = w
    viewH = h
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, input.touch ? 1.75 : 2))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = clamp(60 + (1.3 - camera.aspect) * 28, 60, 84)
    camera.updateProjectionMatrix()
}

let last = performance.now(), wasPaused = false, menuAngle = 0.6
function frame(now) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    frameCount++
    fit()

    if (G.mode !== 'menu') {
        if (input.take('pause')) { if (G.userPaused) closePause(); else if (G.mapOpen) toggleMap(); else openPause() }
        if (input.take('map') && G.mode === 'play') toggleMap()
    }
    const paused = G.adPaused || document.hidden || (G.mode !== 'menu' && (ui.modalOpen || G.mapOpen))
    if (paused !== wasPaused) {
        wasPaused = paused
        audio.setPaused(paused)
    }
    if (G.adPaused || document.hidden) return

    input.read()
    if (G.mode === 'menu') {
        menuAngle += dt * 0.06
        updateAmbient(dt)
        camera.position.set(Math.sin(menuAngle) * 150, 62, Math.cos(menuAngle) * 150)
        camera.lookAt(0, 4, 0)
        input.flush()
    } else if (!paused) {
        G.time += dt
        update(dt)
    } else {
        input.flush()
    }
    input.lookX = input.lookY = 0
    input.any = false
    renderer.render(scene, camera)
}

// Hooks for automated playtests.
window.__game = {
    version: VERSION, state: G, player, cam, cars, cops, gang, peds, coins, poi, world, input, renderer, camera, beam,
    start: (fresh = true) => startGame(fresh ? null : readSave()),
    teleport: (x, z) => { if (player.car) exitCar(); placePlayer(x, z, cam.yaw) },
    completeMission, hurtPlayer, offence, busted, openPause, toMenu, save,
}

fit()
requestAnimationFrame(frame)
platform.ready()

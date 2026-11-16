// The town: a 6 x 6 grid of blocks built from code, merged into a handful of meshes.
// Also produces the collision boxes, the map picture and the points of interest.

import * as THREE from '../lib/three.module.min.js'

export const N = 6
export const BLOCK = 44
export const ROAD = 14
export const PITCH = BLOCK + ROAD
export const HALF = (N * PITCH) / 2
export const EDGE = HALF + ROAD / 2     // outer kerb of the outermost roads
export const LIMIT = EDGE + 3           // how far anything can travel
export const GROUND = EDGE + 9          // half-size of the textured ground
export const KERB = 0.18

export const nodePos = (i) => i * PITCH - HALF            // road centre line, i = 0..N
export const blockCentre = (i) => nodePos(i) + PITCH / 2  // block, i = 0..N-1
export const nearestNode = (v) => Math.max(0, Math.min(N, Math.round((v + HALF) / PITCH)))

export function mulberry(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Height of the ground: pavements are a little higher than the road.
export function groundY(x, z) {
    if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) return KERB
    const u = (((x + HALF) % PITCH) + PITCH) % PITCH
    const v = (((z + HALF) % PITCH) + PITCH) % PITCH
    return u > ROAD / 2 && u < PITCH - ROAD / 2 && v > ROAD / 2 && v < PITCH - ROAD / 2 ? KERB : 0
}

// Collects boxes into one geometry (positions, normals, vertex colours, uvs).
export class Builder {
    constructor() {
        this.p = []; this.n = []; this.c = []; this.u = []; this.i = []
        this.col = new THREE.Color()
    }
    quad(a, b, c, d, nx, ny, nz, color, uw = 0, uh = 0) {
        const base = this.p.length / 3
        this.p.push(...a, ...b, ...c, ...d)
        this.col.setHex(color)
        for (let k = 0; k < 4; k++) {
            this.n.push(nx, ny, nz)
            this.c.push(this.col.r, this.col.g, this.col.b)
        }
        this.u.push(0, 0, uw, 0, uw, uh, 0, uh)
        this.i.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    // Box with its base at height y. `uv` = [metres per tile across, up] for window textures.
    box(x, y, z, w, h, d, color, o = {}) {
        const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2
        const uw = o.uv ? Math.max(1, Math.round(w / o.uv[0])) : 0
        const ud = o.uv ? Math.max(1, Math.round(d / o.uv[0])) : 0
        const uh = o.uv ? Math.max(1, Math.round(h / o.uv[1])) : 0
        this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, color, ud, uh)
        this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, color, ud, uh)
        this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, color, uw, uh)
        this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, color, uw, uh)
        this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, o.top ?? color)
    }
    geometry() {
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3))
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2))
        g.setIndex(this.i)
        return g
    }
}

function windowTexture(R) {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 128, 128)
    const shades = ['#3b4a63', '#46587a', '#2f3b52', '#5b6f8f', '#e8d48a']
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = shades[Math.floor(R() * (R() < 0.12 ? 5 : 4))]
        g.fillRect(i * 32 + 7, j * 32 + 6, 18, 20)
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(0.25, 0.25)       // one window per uv unit
    t.colorSpace = THREE.SRGBColorSpace
    return t
}

export function makeLabel(text, { color = '#fff', bg = 'rgba(20,24,38,.82)', scale = 1 } = {}) {
    const c = document.createElement('canvas')
    const g = c.getContext('2d')
    const font = 'italic 900 44px "Trebuchet MS", "Segoe UI", system-ui, sans-serif'
    g.font = font
    c.width = Math.ceil(g.measureText(text).width) + 48
    c.height = 72
    g.font = font
    g.fillStyle = bg
    g.beginPath()
    g.roundRect(0, 0, c.width, c.height, 18)
    g.fill()
    g.fillStyle = color
    g.textBaseline = 'middle'
    g.fillText(text, 24, 38)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }))
    s.scale.set((c.width / 72) * scale, scale, 1)
    return s
}

const WALLS = [0xc98a6b, 0xd9b38c, 0x9fb4c7, 0xb5c9a8, 0xe0c9a6, 0xb0938a, 0xd3a5a0, 0x8fa3b5, 0xd4d0c8, 0xe2b96f]
const SPECIAL = {
    '1,4': 'hideout', '4,1': 'station', '5,5': 'turf',
    '2,2': 'park', '3,4': 'park', '0,5': 'park', '5,0': 'park', '0,0': 'depot',
}

export function buildWorld(scene) {
    const R = mulberry(20261116)
    const rnd = (a, b) => a + R() * (b - a)
    const pick = (arr) => arr[Math.floor(R() * arr.length)]
    const solid = new Builder()     // plain vertex-coloured geometry
    const walls = new Builder()     // buildings with the window texture
    const colliders = []
    const mapRects = []             // [x0, z0, x1, z1, colour] for the map picture
    const blocks = []
    const coinSpots = [], parkSpots = []
    const poi = {}

    const collide = (x, z, w, d, h = 99) => colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h })
    const prop = (x, y, z, w, h, d, color, o) => { solid.box(x, y, z, w, h, d, color, o); collide(x, z, w, d, y + h) }
    const mapRect = (x, z, w, d, color) => mapRects.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2, color])

    function tree(x, z, s = 1) {
        prop(x, KERB, z, 0.5 * s, 2.2 * s, 0.5 * s, 0x7a5236)
        solid.box(x, KERB + 1.9 * s, z, 2.8 * s, 2.1 * s, 2.8 * s, 0x3f9b4b)
        solid.box(x, KERB + 3.7 * s, z, 1.7 * s, 1.5 * s, 1.7 * s, 0x58b85f)
    }
    function building(x, z, w, d, h, color) {
        walls.box(x, KERB, z, w, h, d, color, { uv: [4, 3.4], top: 0x6b6f78 })
        collide(x, z, w, d)
        mapRect(x, z, w, d, '#a7adba')
        if (R() < 0.6) solid.box(x + rnd(-w / 5, w / 5), KERB + h, z + rnd(-d / 5, d / 5), 2.4, 1.2, 2.4, 0x8d929c)
    }
    // Fence along one side of a rectangle, with an optional gap.
    function fence(x0, z0, x1, z1, color, gap) {
        const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0)
        const a = horizontal ? x0 : z0, b = horizontal ? x1 : z1
        const parts = gap ? [[a, gap[0]], [gap[1], b]] : [[a, b]]
        for (const [s, e] of parts) {
            if (e - s < 0.5) continue
            const mid = (s + e) / 2, len = e - s
            if (horizontal) prop(mid, KERB, z0, len, 1.7, 0.3, color)
            else prop(x0, KERB, mid, 0.3, 1.7, len, color)
        }
    }

    function regularBlock(cx, cz) {
        const sx = cx + rnd(-4, 4), sz = cz + rnd(-4, 4), inner = BLOCK / 2 - 4, alley = 1.6
        const distC = Math.hypot(cx, cz)
        const quads = [
            [cx - inner, cz - inner, sx - alley, sz - alley], [sx + alley, cz - inner, cx + inner, sz - alley],
            [cx - inner, sz + alley, sx - alley, cz + inner], [sx + alley, sz + alley, cx + inner, cz + inner],
        ]
        for (const [x0, z0, x1, z1] of quads) {
            const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2
            if (R() < 0.13) {
                mapRect(mx, mz, x1 - x0, z1 - z0, '#5aa868')
                solid.box(mx, KERB, mz, x1 - x0, 0.05, z1 - z0, 0x6dbb74)
                tree(mx - 2.5, mz - 2); tree(mx + 3, mz + 2.5, 0.85)
                coinSpots.push([mx, mz])
                continue
            }
            const h = 7 + rnd(0, 9) + Math.max(0, 17 - distC / 9) * rnd(0.5, 1)
            building(mx, mz, x1 - x0 - rnd(0, 1.5), z1 - z0 - rnd(0, 1.5), h, pick(WALLS))
        }
        coinSpots.push([sx, sz])
    }

    function park(cx, cz) {
        solid.box(cx, KERB, cz, 36, 0.05, 36, 0x6dbb74)
        mapRect(cx, cz, 36, 36, '#5aa868')
        prop(cx, KERB, cz, 6, 0.6, 6, 0xb9bcc4)                 // fountain
        solid.box(cx, KERB + 0.6, cz, 4.6, 0.12, 4.6, 0x4fb3e8)
        prop(cx, KERB, cz, 1, 2.2, 1, 0xb9bcc4)
        for (let i = 0; i < 11; i++) {
            const a = (i / 11) * Math.PI * 2 + rnd(-0.2, 0.2), r = rnd(9, 16)
            tree(cx + Math.cos(a) * r, cz + Math.sin(a) * r, rnd(0.85, 1.25))
        }
        for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) {
            prop(cx + dx, KERB, cz + dz, dx ? 0.7 : 2.2, 0.55, dx ? 2.2 : 0.7, 0x9c6b3f)
            coinSpots.push([cx + dx * 1.9, cz + dz * 1.9])
        }
    }

    function hideout(cx, cz) {
        solid.box(cx, KERB, cz, 36, 0.05, 36, 0x7cc47f)
        mapRect(cx, cz, 36, 36, '#5aa868')
        walls.box(cx, KERB, cz - 9, 14, 6, 10, 0xe9d8a6, { uv: [3.5, 3], top: 0xb5533c })
        collide(cx, cz - 9, 14, 10)
        mapRect(cx, cz - 9, 14, 10, '#f2c14e')
        solid.box(cx, KERB + 6, cz - 9, 11, 1.6, 7, 0xb5533c)
        solid.box(cx, KERB + 7.6, cz - 9, 7, 1.2, 4, 0xa3452f)
        prop(cx + 4.5, KERB + 6, cz - 11, 1.2, 3.2, 1.2, 0x8d5a4a)
        solid.box(cx, KERB, cz - 3.9, 2, 3.4, 0.25, 0x5c3b2a)   // door
        const f = 0xf4f1e8
        fence(cx - 18, cz - 18, cx + 18, cz - 18, f)
        fence(cx - 18, cz - 18, cx - 18, cz + 18, f)
        fence(cx + 18, cz - 18, cx + 18, cz + 18, f)
        fence(cx - 18, cz + 18, cx + 18, cz + 18, f, [cx - 5, cx + 5])
        tree(cx - 13, cz - 12); tree(cx + 14, cz - 4, 0.9)
        solid.box(cx, KERB + 0.05, cz + 9, 3, 0.03, 18, 0xd9c7a3)  // path
        poi.hideout = {
            x: cx, z: cz, spawn: [cx, cz + 4], save: [cx - 10, cz + 6],
            stands: [0, 1, 2, 3].map((i) => [cx + 5 + i * 3.6, cz + 2 + (i % 2) * 5]),
        }
    }

    function station(cx, cz) {
        solid.box(cx, KERB, cz, 36, 0.05, 36, 0xc7cad1)
        walls.box(cx, KERB, cz - 8, 28, 9, 16, 0xeef1f6, { uv: [4, 3], top: 0x5a6070 })
        collide(cx, cz - 8, 28, 16)
        mapRect(cx, cz - 8, 28, 16, '#5b8def')
        solid.box(cx, KERB + 6.2, cz - 8, 28.3, 0.9, 16.3, 0x2f5fd0)
        solid.box(cx, KERB, cz + 0.2, 6, 3.6, 0.5, 0x2f5fd0)     // entrance
        for (const dx of [-11, 11]) prop(cx + dx, KERB, cz + 6, 0.5, 5.5, 0.5, 0x8d929c)
        solid.box(cx - 11, KERB + 4, cz + 6.4, 0.1, 1.4, 2.2, 0x2f5fd0)
        solid.box(cx + 11, KERB + 4, cz + 6.4, 0.1, 1.4, 2.2, 0x2f5fd0)
        const sign = makeLabel('POLICE', { bg: '#2f5fd0', scale: 2.2 })
        sign.position.set(cx, KERB + 10.6, cz - 1)
        scene.add(sign)
        poi.station = { x: cx, z: cz, frank: [cx, cz + 7], spawn: [cx + 5, cz + 12] }
    }

    function turf(cx, cz) {
        solid.box(cx, KERB, cz, 36, 0.05, 36, 0xa58a63)
        mapRect(cx, cz, 36, 36, '#a37c52')
        walls.box(cx, KERB, cz + 12, 24, 8, 10, 0x8c5f4a, { uv: [6, 4], top: 0x4e5560 })
        collide(cx, cz + 12, 24, 10)
        mapRect(cx, cz + 12, 24, 10, '#d2553f')
        solid.box(cx, KERB, cz + 6.9, 7, 4.5, 0.3, 0x3a3f4a)     // shutter
        const f = 0x7b8494
        fence(cx - 18, cz - 18, cx + 18, cz - 18, f, [cx - 6, cx + 6])
        fence(cx - 18, cz - 18, cx - 18, cz + 18, f, [cz - 9, cz - 1])
        fence(cx + 18, cz - 18, cx + 18, cz + 18, f)
        fence(cx - 18, cz + 18, cx + 18, cz + 18, f)
        const crates = [[-11, -8, 2], [-9, 4, 1], [-3, -4, 1], [5, -9, 2], [10, -2, 1], [12, 3, 2], [3, 2, 1], [-13, -1, 1]]
        const paint = [0xe8a23a, 0x4fb3e8, 0xd2553f, 0x6dbb74]
        for (const [dx, dz, lv] of crates) prop(cx + dx, KERB, cz + dz, 2.4, 1.5 * lv, 2.4, pick(paint))
        prop(cx + 13, KERB, cz - 12, 4.4, 1.4, 2, 0x9aa0ab)      // scrap car body
        solid.box(cx + 13, KERB + 1.4, cz - 12, 2.2, 0.7, 1.8, 0x5d6470)
        poi.turf = {
            x: cx, z: cz, boss: [cx, cz + 3],
            crew: [[-8, -3], [8, -5], [-5, 3], [7, 2], [0, -8], [-12, -6], [12, -8], [3, -12]].map(([dx, dz]) => [cx + dx, cz + dz]),
        }
    }

    function depot(cx, cz) {
        solid.box(cx, KERB, cz, 36, 0.05, 36, 0xc7cad1)
        building(cx, cz - 7, 30, 18, 7, 0xd9b38c)
        // bus shelter facing the south road
        prop(cx - 6, KERB, cz + 15, 0.3, 2.8, 0.3, 0x5a6070)
        prop(cx + 6, KERB, cz + 15, 0.3, 2.8, 0.3, 0x5a6070)
        solid.box(cx, KERB + 2.8, cz + 15.5, 13, 0.25, 3, 0x2f9e8f)
        prop(cx, KERB, cz + 14.6, 8, 0.5, 0.8, 0x9c6b3f)
        tree(cx - 14, cz + 12); tree(cx + 14, cz + 12)
        poi.start = [cx, cz + 19.5]
    }

    for (let bi = 0; bi < N; bi++) for (let bj = 0; bj < N; bj++) {
        const cx = blockCentre(bi), cz = blockCentre(bj), type = SPECIAL[`${bi},${bj}`] || 'city'
        blocks.push({ bi, bj, cx, cz, type })
        solid.box(cx, 0, cz, BLOCK, KERB, BLOCK, 0xb9bcc4)
        ;({ hideout, station, turf, park, depot, city: regularBlock })[type](cx, cz)
        // street lamps on two corners
        for (const [sx, sz] of [[-1, -1], [1, 1]]) {
            const lx = cx + sx * (BLOCK / 2 - 1), lz = cz + sz * (BLOCK / 2 - 1)
            prop(lx, KERB, lz, 0.22, 5.2, 0.22, 0x4a4f5a)
            solid.box(lx - sx * 0.7, KERB + 5.1, lz, 1.6, 0.18, 0.4, 0x4a4f5a)
            solid.box(lx - sx * 1.3, KERB + 4.95, lz, 0.5, 0.16, 0.4, 0xfff3b0)
        }
        // pavement coins and kerb-side parking
        if (type !== 'turf') {
            coinSpots.push([cx + rnd(-16, 16), cz + (R() < 0.5 ? -1 : 1) * (BLOCK / 2 - 2)])
            if (R() < 0.42 && type === 'city') parkSpots.push([cx + rnd(-10, 10), cz + BLOCK / 2 + 1.25, Math.PI / 2])
        }
    }
    parkSpots.push([poi.start[0] + 8, poi.start[1] + 3.75, Math.PI / 2])
    parkSpots.push([poi.hideout.x + 10, poi.hideout.z + BLOCK / 2 + 1.25, -Math.PI / 2])
    parkSpots.push([poi.station.x - 12, poi.station.z + BLOCK / 2 + 1.25, Math.PI / 2])
    // a parked bus by the stop, where the story starts
    prop(poi.start[0] - 9, 0, poi.start[1] + 3.9, 10, 0.5, 2.5, 0x2a2d33)
    solid.box(poi.start[0] - 9, 0.5, poi.start[1] + 3.9, 10, 2.6, 2.5, 0xf2b632, { top: 0xf7f4ea })
    solid.box(poi.start[0] - 9, 1.5, poi.start[1] + 3.9, 9.4, 1, 2.56, 0x3b4a63)

    // outer pavement and a ring of trees so the town does not end in thin air
    for (const s of [-1, 1]) {
        solid.box(0, 0, s * (EDGE + 4.5), GROUND * 2, KERB, 9, 0x8fce8a)
        solid.box(s * (EDGE + 4.5), 0, 0, 9, KERB, EDGE * 2, 0x8fce8a)
        for (let t = -GROUND + 5; t < GROUND; t += 9) {
            const off = EDGE + 6 + Math.abs((t * 7.3) % 3)
            for (const [x, z] of [[t, s * off], [s * off, t]]) {
                const sc = 1.3 + (((t + 400) * 3.7) % 1) * 0.6
                solid.box(x, KERB, z, 0.6 * sc, 2.2 * sc, 0.6 * sc, 0x7a5236)
                solid.box(x, KERB + 1.9 * sc, z, 3 * sc, 2.2 * sc, 3 * sc, 0x3f9b4b)
                solid.box(x, KERB + 3.8 * sc, z, 1.8 * sc, 1.5 * sc, 1.8 * sc, 0x58b85f)
            }
        }
    }

    // ---- ground texture and map picture ----
    function paint(ctx, size, mirror, detailed) {
        const P = (v) => ((mirror ? GROUND - v : v + GROUND) / (2 * GROUND)) * size
        const rect = (x0, z0, x1, z1, color) => {
            ctx.fillStyle = color
            ctx.fillRect(Math.min(P(x0), P(x1)), Math.min(P(z0), P(z1)), Math.abs(P(x1) - P(x0)), Math.abs(P(z1) - P(z0)))
        }
        rect(-GROUND, -GROUND, GROUND, GROUND, detailed ? '#8fce8a' : '#3c7a4a')
        rect(-EDGE, -EDGE, EDGE, EDGE, detailed ? '#474b55' : '#2d313b')
        if (detailed) {
            const N2 = mulberry(7)
            for (let i = 0; i < 9000; i++) {
                const x = (N2() * 2 - 1) * EDGE, z = (N2() * 2 - 1) * EDGE
                rect(x, z, x + 0.5, z + 0.5, N2() < 0.5 ? '#4f545f' : '#40444d')
            }
            for (let i = 0; i <= N; i++) {
                const c = nodePos(i)
                for (let j = 0; j < N; j++) {
                    const a = nodePos(j) + ROAD / 2 + 4.5, b = nodePos(j + 1) - ROAD / 2 - 4.5
                    for (let t = a; t < b - 2; t += 6) {
                        rect(c - 0.18, t, c + 0.18, t + 3, '#e9c84a')
                        rect(t, c - 0.18, t + 3, c + 0.18, '#e9c84a')
                    }
                }
                for (let j = 0; j <= N; j++) {
                    const o = nodePos(j)
                    for (const s of [-1, 1]) {
                        const at = o + s * (ROAD / 2 + 2)
                        for (let k = -ROAD / 2 + 1; k < ROAD / 2 - 1; k += 1.4) {
                            if (Math.abs(at) < EDGE) {
                                rect(c + k, at - 1.3, c + k + 0.7, at + 1.3, '#e8eaee')
                                rect(at - 1.3, c + k, at + 1.3, c + k + 0.7, '#e8eaee')
                            }
                        }
                    }
                }
            }
        } else {
            for (const b of blocks) rect(b.cx - BLOCK / 2, b.cz - BLOCK / 2, b.cx + BLOCK / 2, b.cz + BLOCK / 2, '#737a88')
            for (const [x0, z0, x1, z1, color] of mapRects) rect(x0, z0, x1, z1, color)
        }
    }

    const groundCanvas = document.createElement('canvas')
    groundCanvas.width = groundCanvas.height = 2048
    paint(groundCanvas.getContext('2d'), 2048, false, true)
    const groundTex = new THREE.CanvasTexture(groundCanvas)
    groundTex.colorSpace = THREE.SRGBColorSpace
    groundTex.anisotropy = 4
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND * 2, GROUND * 2), new THREE.MeshLambertMaterial({ map: groundTex }))
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)
    const far = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.MeshLambertMaterial({ color: 0x7fc47c }))
    far.rotation.x = -Math.PI / 2
    far.position.y = -0.06
    scene.add(far)

    const mapCanvas = document.createElement('canvas')
    mapCanvas.width = mapCanvas.height = 512
    paint(mapCanvas.getContext('2d'), 512, true, false)

    scene.add(new THREE.Mesh(solid.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true })))
    scene.add(new THREE.Mesh(walls.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture(R) })))

    // ---- collision lookup ----
    const CELL = 16
    const grid = new Map()
    for (const c of colliders) {
        for (let gx = Math.floor(c.x0 / CELL); gx <= Math.floor(c.x1 / CELL); gx++) {
            for (let gz = Math.floor(c.z0 / CELL); gz <= Math.floor(c.z1 / CELL); gz++) {
                const k = gx * 1000 + gz
                if (!grid.has(k)) grid.set(k, [])
                grid.get(k).push(c)
            }
        }
    }
    const EMPTY = []
    const cell = (x, z) => grid.get(Math.floor(x / CELL) * 1000 + Math.floor(z / CELL)) || EMPTY

    // Pushes a circle out of every wall it overlaps. Returns true if it touched one.
    function resolve(o, r, minH = 0) {
        let hit = false
        for (let gx = Math.floor((o.x - r) / CELL); gx <= Math.floor((o.x + r) / CELL); gx++) {
            for (let gz = Math.floor((o.z - r) / CELL); gz <= Math.floor((o.z + r) / CELL); gz++) {
                const list = grid.get(gx * 1000 + gz)
                if (!list) continue
                for (const c of list) {
                    if (c.h < minH) continue
                    const nx = Math.max(c.x0, Math.min(c.x1, o.x)), nz = Math.max(c.z0, Math.min(c.z1, o.z))
                    const dx = o.x - nx, dz = o.z - nz, d2 = dx * dx + dz * dz
                    if (d2 >= r * r) continue
                    hit = true
                    if (d2 > 1e-8) {
                        const d = Math.sqrt(d2)
                        o.x += (dx / d) * (r - d)
                        o.z += (dz / d) * (r - d)
                    } else {
                        const l = o.x - c.x0, rr = c.x1 - o.x, t = o.z - c.z0, b = c.z1 - o.z, m = Math.min(l, rr, t, b)
                        if (m === l) o.x = c.x0 - r
                        else if (m === rr) o.x = c.x1 + r
                        else if (m === t) o.z = c.z0 - r
                        else o.z = c.z1 + r
                    }
                }
            }
        }
        if (Math.abs(o.x) > LIMIT) { o.x = Math.sign(o.x) * LIMIT; hit = true }
        if (Math.abs(o.z) > LIMIT) { o.z = Math.sign(o.z) * LIMIT; hit = true }
        return hit
    }

    // Is the point inside something at least `h` tall?
    function solidAt(x, z, h = 0) {
        for (const c of cell(x, z)) if (c.h >= h && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return c
        return null
    }
    // Is the straight line between two points blocked by a tall wall?
    function blocked(x0, z0, x1, z1, h = 2.5) {
        const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(d / 2)
        for (let i = 1; i < steps; i++) {
            const t = i / steps
            if (solidAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, h)) return true
        }
        return false
    }

    const mapXY = (x, z) => [((GROUND - x) / (2 * GROUND)) * 512, ((GROUND - z) / (2 * GROUND)) * 512]

    return { blocks, poi, coinSpots, parkSpots, resolve, solidAt, blocked, mapCanvas, mapXY }
}

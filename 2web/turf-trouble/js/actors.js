// Low-poly people and cars, built from boxes.

import * as THREE from '../lib/three.module.min.js'
import { Builder } from './world.js'

const geo = {}
const mats = new Map()
const mat = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshLambertMaterial({ color }))
    return mats.get(color)
}
// Box whose top-centre is the origin, so limbs swing from the joint.
const hanging = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0)

function shared() {
    if (geo.body) return
    geo.body = new THREE.BoxGeometry(0.56, 0.7, 0.32).translate(0, 1.15, 0)
    geo.head = new THREE.BoxGeometry(0.34, 0.34, 0.34).translate(0, 1.7, 0)
    geo.hair = new THREE.BoxGeometry(0.37, 0.13, 0.37).translate(0, 1.9, -0.01)
    geo.cap = new THREE.BoxGeometry(0.4, 0.12, 0.52).translate(0, 1.92, 0.06)
    geo.arm = hanging(0.17, 0.66, 0.19)
    geo.leg = hanging(0.22, 0.8, 0.24)
    geo.tool = new THREE.BoxGeometry(0.13, 0.5, 0.2).translate(0, -0.8, 0.07)   // points forward when the arm is raised
    geo.shadow = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2)
    geo.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })
}

export function makeShadow(radius) {
    shared()
    const m = new THREE.Mesh(geo.shadow, geo.shadowMat)
    m.scale.setScalar(radius)
    m.position.y = 0.03
    return m
}

export function makePerson({ shirt, pants = 0x3d4f6b, skin = 0xe6b58e, hair = 0x3a2a20, cap = null, scale = 1 }) {
    shared()
    const group = new THREE.Group()
    const add = (g, color, x = 0, y = 0) => {
        const m = new THREE.Mesh(g, mat(color))
        m.position.set(x, y, 0)
        group.add(m)
        return m
    }
    const body = add(geo.body, shirt)
    add(geo.head, skin)
    add(cap ? geo.cap : geo.hair, cap ?? hair)
    const armL = add(geo.arm, shirt, 0.37, 1.48)
    const armR = add(geo.arm, shirt, -0.37, 1.48)
    const legL = add(geo.leg, pants, 0.15, 0.8)
    const legR = add(geo.leg, pants, -0.15, 0.8)
    const tool = new THREE.Mesh(geo.tool, mat(0x22d3ee))
    tool.visible = false
    armR.add(tool)
    const shadow = makeShadow(0.5)
    group.add(shadow)
    group.scale.setScalar(scale)
    return {
        group, body, armL, armR, legL, legR, tool, shadow, phase: Math.random() * 6,
        setShirt(color) { body.material = armL.material = armR.material = mat(color) },
        setTool(color) { tool.visible = color !== null; if (color !== null) tool.material = mat(color) },
        // speed in m/s drives the walk cycle; aiming lifts the right arm.
        animate(dt, speed, aiming = false) {
            this.phase += dt * (4 + speed * 1.5)
            const amp = Math.min(0.9, speed * 0.16), s = Math.sin(this.phase) * amp
            legL.rotation.x = s
            legR.rotation.x = -s
            armL.rotation.x = -s
            armR.rotation.x = aiming ? -Math.PI / 2 : s
        },
    }
}

const CAR_COLORS = [0xe4572e, 0x29a4d9, 0xf2c14e, 0x6dbb74, 0xb86adf, 0xf08a5d, 0xf4f1e8, 0x3ac1b0]

// kind: 'crew' (yours to drive), 'traffic', 'police'
export function makeCar(kind, colorIndex = 0) {
    shared()
    const b = new Builder()
    const body = kind === 'police' ? 0xf4f6fa : kind === 'crew' ? 0x2b2f3a : CAR_COLORS[colorIndex % CAR_COLORS.length]
    const trim = kind === 'police' ? 0x2f5fd0 : kind === 'crew' ? 0x22d3ee : body
    b.box(0, 0.32, 0, 1.9, 0.62, 4.3, body)
    b.box(0, 0.5, 0, 1.94, 0.16, 4.34, trim)
    b.box(0, 0.94, -0.25, 1.66, 0.56, 2.2, 0x26323f, { top: body })
    for (const sx of [-1, 1]) {
        for (const sz of [-1.35, 1.35]) b.box(sx * 0.88, 0, sz, 0.3, 0.68, 0.72, 0x1b1d22)
        b.box(sx * 0.62, 0.6, 2.13, 0.4, 0.2, 0.08, 0xfff3b0)
        b.box(sx * 0.62, 0.6, -2.13, 0.4, 0.2, 0.08, 0xe5383b)
    }
    const group = new THREE.Group()
    group.add(new THREE.Mesh(b.geometry(), mat('car')))
    let lights = null
    if (kind === 'police') {
        lights = [0xe5383b, 0x2f7bf0].map((c, i) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.3), new THREE.MeshBasicMaterial({ color: c }))
            m.position.set(i ? 0.35 : -0.35, 1.6, -0.25)
            group.add(m)
            return m
        })
    }
    const shadow = makeShadow(1)
    shadow.scale.set(1.3, 1, 2.5)
    group.add(shadow)
    return { group, lights }
}
mats.set('car', new THREE.MeshLambertMaterial({ vertexColors: true }))

// Keyboard + mouse and touch, merged into one state object the game reads each frame.
// No pointer lock: the game runs in a sandboxed frame, so looking is done by dragging.

const KEY_ACTIONS = {
    KeyE: 'interact', KeyF: 'interact', Enter: 'interact',
    KeyQ: 'swap', KeyR: 'reload', KeyM: 'map', Escape: 'pause', KeyP: 'pause',
    Space: 'jump', Digit1: 'slot0', Digit2: 'slot1', Digit3: 'slot2', Digit4: 'slot3',
}
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'])

export function createInput(canvas, els) {
    const keys = new Set()
    const pressed = new Set()
    const s = {
        mx: 0, my: 0,            // movement, -1..1 (x: right, y: forward)
        lookX: 0, lookY: 0,      // accumulated drag in pixels since last read
        fire: false, sprint: false, brake: false,
        touch: matchMedia('(pointer: coarse)').matches,
        any: false,              // any input since last read (used to skip the intro)
        take(name) { return pressed.delete(name) },
        flush() { pressed.clear() },
        clear() { keys.clear(); pressed.clear(); mouseFire = keyFire = touchFire = false; stick = null; btnBrake = false; showStick() },
    }
    let mouseFire = false, keyFire = false, touchFire = false, btnBrake = false
    let stick = null      // { id, ox, oy, x, y }
    let lookId = null
    const mouseDown = new Set()

    const setTouch = (on) => {
        if (s.touch === on) return
        s.touch = on
        document.body.classList.toggle('touch', on)
    }
    document.body.classList.toggle('touch', s.touch)

    addEventListener('keydown', (e) => {
        if (GAME_KEYS.has(e.code)) e.preventDefault()
        if (e.repeat) return
        s.any = true
        keys.add(e.code)
        if (KEY_ACTIONS[e.code]) pressed.add(KEY_ACTIONS[e.code])
        if (e.code === 'KeyK' || e.code === 'ControlLeft') keyFire = true
    })
    addEventListener('keyup', (e) => {
        keys.delete(e.code)
        if (e.code === 'KeyK' || e.code === 'ControlLeft') keyFire = false
    })
    addEventListener('blur', () => s.clear())

    function showStick() {
        if (!els.stick) return
        els.stick.style.display = stick ? 'block' : 'none'
        if (!stick) return
        els.stick.style.left = stick.ox + 'px'
        els.stick.style.top = stick.oy + 'px'
        els.knob.style.transform = `translate(${stick.x * 44}px, ${stick.y * 44}px)`
    }

    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('pointerdown', (e) => {
        s.any = true
        if (e.pointerType === 'mouse') {
            setTouch(false)
            mouseDown.add(e.button)
            if (e.button === 0) mouseFire = true
        } else {
            setTouch(true)
            const r = canvas.getBoundingClientRect()
            if (!stick && e.clientX - r.left < r.width * 0.45) {
                stick = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: 0, y: 0 }
                showStick()
            } else if (lookId === null) {
                lookId = e.pointerId
            }
        }
        try { canvas.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
        e.preventDefault()
    })
    canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'mouse') {
            if (mouseDown.size) { s.lookX += e.movementX; s.lookY += e.movementY }
            return
        }
        if (stick && e.pointerId === stick.id) {
            const r = canvas.getBoundingClientRect()
            let dx = (e.clientX - r.left - stick.ox) / 44, dy = (e.clientY - r.top - stick.oy) / 44
            const m = Math.hypot(dx, dy)
            if (m > 1) { dx /= m; dy /= m }
            stick.x = dx
            stick.y = dy
            showStick()
        } else if (e.pointerId === lookId) {
            s.lookX += e.movementX * 1.6
            s.lookY += e.movementY * 1.6
        }
    })
    const release = (e) => {
        if (e.pointerType === 'mouse') {
            mouseDown.delete(e.button)
            if (e.button === 0) mouseFire = false
            return
        }
        if (stick && e.pointerId === stick.id) { stick = null; showStick() }
        if (e.pointerId === lookId) lookId = null
    }
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)

    // On-screen buttons. `hold` buttons report a state, the others fire once.
    function button(el, { hold, action }) {
        if (!el) return
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            s.any = true
            if (e.pointerType !== 'mouse') setTouch(true)
            if (hold === 'fire') touchFire = true
            if (hold === 'brake') btnBrake = true
            if (action) pressed.add(action)
            try { el.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
        })
        const up = () => {
            if (hold === 'fire') touchFire = false
            if (hold === 'brake') btnBrake = false
        }
        el.addEventListener('pointerup', up)
        el.addEventListener('pointercancel', up)
        el.addEventListener('contextmenu', (e) => e.preventDefault())
    }
    button(els.fire, { hold: 'fire' })
    button(els.jump, { hold: 'brake', action: 'jump' })
    button(els.act, { action: 'interact' })
    button(els.swap, { action: 'swap' })

    s.read = () => {
        let mx = 0, my = 0
        if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1
        if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1
        if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1
        if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1
        let sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
        if (stick) {
            mx = stick.x
            my = -stick.y
            if (Math.hypot(mx, my) > 0.9) sprint = true
            if (Math.hypot(mx, my) < 0.15) { mx = 0; my = 0 }
        }
        s.mx = mx
        s.my = my
        s.sprint = sprint
        s.fire = mouseFire || keyFire || touchFire
        s.brake = keys.has('Space') || btnBrake
    }
    return s
}

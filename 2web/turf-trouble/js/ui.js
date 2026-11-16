// Everything drawn with HTML on top of the 3D view: HUD, menus, pop-ups, maps.

const $ = (id) => document.getElementById(id)

export function createUI() {
    const el = {
        hud: $('hud'), touch: $('touch'), menu: $('menu'), modal: $('modal'), map: $('map'), caption: $('caption'),
        health: $('health'), mission: $('mission'), money: $('money'), heat: $('heat'), toast: $('toast'),
        prompt: $('prompt'), gadget: $('gadget'), gadgetName: $('gadget-name'), ammo: $('ammo'),
        bust: $('bust'), boss: $('boss'), crosshair: $('crosshair'), hurt: $('hurt'),
        minimap: $('minimap'), bigmap: $('bigmap'),
        tFire: $('t-fire'), tJump: $('t-jump'), tAct: $('t-act'), tSwap: $('t-swap'),
    }
    const cache = {}
    // Only touch the DOM when a value really changed.
    const set = (key, value, apply) => {
        if (cache[key] === value) return
        cache[key] = value
        apply(value)
    }
    let toastTimer = 0

    const ui = {
        el,
        show(name, on) { el[name].hidden = !on },
        health(ratio) { set('health', Math.round(ratio * 100), (v) => { el.health.style.transform = `scaleX(${v / 100})` }) },
        hurt(amount) { set('hurt', Math.round(amount * 10), (v) => { el.hurt.style.opacity = v / 10 }) },
        money(n) { set('money', n, (v) => { el.money.textContent = '$' + v.toLocaleString('en-US') }) },
        mission(text) { set('mission', text, (v) => { el.mission.textContent = v }) },
        heat(level, flashing) {
            set('heat', level, (v) => [...el.heat.children].forEach((b, i) => b.classList.toggle('on', i < v)))
            set('heatFlash', flashing, (v) => el.heat.classList.toggle('flash', v))
        },
        meter(name, ratio) {
            set(name + 'On', ratio > 0, (v) => { el[name].hidden = !v })
            set(name, Math.round(ratio * 50), (v) => { el[name].firstElementChild.style.transform = `scaleX(${v / 50})` })
        },
        gadget(name, ammoText) {
            set('gadgetOn', name !== null, (v) => { el.gadget.hidden = !v; el.crosshair.hidden = !v; el.tFire.hidden = !v })
            if (name === null) return
            set('gadgetName', name, (v) => { el.gadgetName.textContent = v })
            set('ammo', ammoText, (v) => { el.ammo.textContent = v })
        },
        crosshair(on) { set('crosshair', on, (v) => { el.crosshair.hidden = !v }) },
        // Context action: keyboard hint in the middle, round button on touch screens.
        hint(key, text, short) {
            set('prompt', text, (v) => {
                el.prompt.hidden = !v
                el.tAct.hidden = !v
                if (!v) return
                el.prompt.innerHTML = ''
                const k = document.createElement('kbd')
                k.textContent = key
                el.prompt.append(k, v)
                el.tAct.textContent = short
            })
        },
        touchButtons({ swap, jumpLabel }) {
            set('tSwap', swap, (v) => { el.tSwap.hidden = !v })
            set('tJump', jumpLabel, (v) => { el.tJump.textContent = v })
        },
        toast(text, ms = 2600) {
            el.toast.textContent = text
            el.toast.classList.add('show')
            clearTimeout(toastTimer)
            toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms)
        },
        caption(text, hint) {
            el.caption.hidden = !text
            if (!text) return
            el.caption.textContent = text
            if (hint) {
                const s = document.createElement('small')
                s.textContent = hint
                el.caption.append(s)
            }
        },
        // buttons: [{ label, kind, onClick(button) }] -- onClick may be async
        modal(title, body, buttons) {
            $('modal-title').textContent = title
            $('modal-body').textContent = body
            const box = $('modal-buttons')
            box.innerHTML = ''
            for (const b of buttons) {
                const btn = document.createElement('button')
                btn.className = 'btn ' + (b.kind || '')
                btn.textContent = b.label
                btn.addEventListener('click', () => b.onClick(btn))
                box.append(btn)
            }
            el.modal.hidden = false
        },
        setModalBody(text) { $('modal-body').textContent = text },
        closeModal() { el.modal.hidden = true },
        get modalOpen() { return !el.modal.hidden },

        // Small map: a window of the town picture around the player.
        drawMinimap(mapCanvas, mapXY, px, pz, yaw, markers) {
            const g = el.minimap.getContext('2d'), S = 160, span = 150   // source pixels shown
            const [cx, cy] = mapXY(px, pz)
            g.fillStyle = '#3c7a4a'
            g.fillRect(0, 0, S, S)
            g.drawImage(mapCanvas, cx - span / 2, cy - span / 2, span, span, 0, 0, S, S)
            const k = S / span
            for (const m of markers) {
                const [mx, my] = mapXY(m.x, m.z)
                let x = (mx - cx) * k + S / 2, y = (my - cy) * k + S / 2
                if (m.clamp) { x = Math.max(9, Math.min(S - 9, x)); y = Math.max(9, Math.min(S - 9, y)) }
                else if (x < 0 || y < 0 || x > S || y > S) continue
                dot(g, x, y, m, 1.25)
            }
            arrow(g, S / 2, S / 2, yaw, 9)
        },
        drawBigMap(mapCanvas, mapXY, px, pz, yaw, markers) {
            const g = el.bigmap.getContext('2d')
            g.drawImage(mapCanvas, 0, 0)
            for (const m of markers) {
                const [x, y] = mapXY(m.x, m.z)
                dot(g, x, y, m, 2.2)
            }
            const [x, y] = mapXY(px, pz)
            arrow(g, x, y, yaw, 13)
        },
    }

    function dot(g, x, y, m, scale) {
        const r = (m.r || 4) * scale
        g.fillStyle = m.color
        g.strokeStyle = '#141826'
        g.lineWidth = 2
        g.beginPath()
        if (m.square) g.rect(x - r, y - r, r * 2, r * 2)
        else g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        if (m.text) {
            g.fillStyle = '#141826'
            g.font = `900 ${Math.round(r * 1.6)}px "Trebuchet MS", system-ui, sans-serif`
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText(m.text, x, y + 0.5)
        }
    }
    // The map is drawn with +z up and +x to the left, matching the 3D camera.
    function arrow(g, x, y, yaw, size) {
        g.save()
        g.translate(x, y)
        g.rotate(Math.atan2(-Math.sin(yaw), Math.cos(yaw)))
        g.fillStyle = '#fff'
        g.strokeStyle = '#141826'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(0, -size)
        g.lineTo(size * 0.7, size * 0.8)
        g.lineTo(0, size * 0.35)
        g.lineTo(-size * 0.7, size * 0.8)
        g.closePath()
        g.fill()
        g.stroke()
        g.restore()
    }
    return ui
}

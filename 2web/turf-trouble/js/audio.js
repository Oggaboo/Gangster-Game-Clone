// All sound is synthesised with Web Audio: no audio files, nothing to download.
// The context is only created after the first tap or key press.

export function createAudio() {
    let ctx = null, master = null, noiseBuf = null
    let engineOsc = null, engineGain = null, sirenGain = null
    let muted = false, paused = false

    const level = () => (muted || paused ? 0 : 0.6)

    function unlock() {
        if (ctx) {
            if (!paused && ctx.state === 'suspended') ctx.resume().catch(() => {})
            return
        }
        const AC = window.AudioContext || window.webkitAudioContext
        if (!AC) return
        try { ctx = new AC() } catch { ctx = null; return }
        master = ctx.createGain()
        master.gain.value = level()
        master.connect(ctx.destination)

        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
        const d = noiseBuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1

        // engine hum
        engineOsc = ctx.createOscillator()
        engineOsc.type = 'sawtooth'
        engineOsc.frequency.value = 60
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 420
        engineGain = ctx.createGain()
        engineGain.gain.value = 0
        engineOsc.connect(lp).connect(engineGain).connect(master)
        engineOsc.start()

        // two-tone siren
        const siren = ctx.createOscillator()
        siren.type = 'triangle'
        siren.frequency.value = 720
        const lfo = ctx.createOscillator()
        lfo.type = 'square'
        lfo.frequency.value = 1.6
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 130
        lfo.connect(lfoGain).connect(siren.frequency)
        sirenGain = ctx.createGain()
        sirenGain.gain.value = 0
        siren.connect(sirenGain).connect(master)
        siren.start()
        lfo.start()
        if (paused) ctx.suspend().catch(() => {})
    }

    function tone(freq, dur, type = 'square', vol = 0.2, slideTo = 0, delay = 0) {
        if (!ctx || paused) return
        const t = ctx.currentTime + delay
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.type = type
        o.frequency.setValueAtTime(freq, t)
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
        g.gain.setValueAtTime(vol, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + dur)
        o.connect(g).connect(master)
        o.start(t)
        o.stop(t + dur + 0.02)
    }

    function noise(dur, vol = 0.3, cutoff = 1200, delay = 0) {
        if (!ctx || paused) return
        const t = ctx.currentTime + delay
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain()
        s.buffer = noiseBuf
        f.type = 'lowpass'
        f.frequency.value = cutoff
        g.gain.setValueAtTime(vol, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + dur)
        s.connect(f).connect(g).connect(master)
        s.start(t)
        s.stop(t + dur + 0.02)
    }

    const sounds = {
        pop: () => { tone(520, 0.09, 'square', 0.12, 180); noise(0.05, 0.12, 3000) },
        launch: () => { tone(160, 0.3, 'sawtooth', 0.2, 60); noise(0.2, 0.2, 800) },
        splat: () => noise(0.14, 0.2, 700),
        hurt: () => tone(220, 0.18, 'sawtooth', 0.16, 90),
        coin: () => { tone(988, 0.07, 'square', 0.1); tone(1319, 0.16, 'square', 0.1, 0, 0.07) },
        bump: () => { tone(90, 0.16, 'sine', 0.4, 40); noise(0.1, 0.25, 500) },
        door: () => { noise(0.06, 0.2, 900); tone(140, 0.08, 'sine', 0.2, 0, 0.05) },
        reload: () => { noise(0.03, 0.15, 4000); noise(0.03, 0.15, 4000, 0.12) },
        click: () => tone(660, 0.05, 'square', 0.08),
        honk: () => { tone(392, 0.22, 'square', 0.07); tone(494, 0.22, 'square', 0.07) },
        down: () => { tone(500, 0.1, 'square', 0.1, 900); tone(900, 0.2, 'triangle', 0.1, 300, 0.1) },
        save: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 0, i * 0.09)),
        win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.11, 0, i * 0.12)),
        bust: () => [440, 370, 311, 233].forEach((f, i) => tone(f, 0.24, 'sawtooth', 0.12, 0, i * 0.16)),
    }

    return {
        unlock,
        play(name) { sounds[name]?.() },
        get muted() { return muted },
        setMuted(m) {
            muted = m
            if (master) master.gain.value = level()
        },
        // Called for every kind of pause: pause menu, ad break, hidden tab.
        setPaused(p) {
            paused = p
            if (!ctx) return
            master.gain.value = level()
            if (p) ctx.suspend().catch(() => {})
            else ctx.resume().catch(() => {})
        },
        setEngine(on, ratio) {
            if (!ctx || paused) return
            const t = ctx.currentTime
            engineGain.gain.setTargetAtTime(on ? 0.035 + 0.05 * ratio : 0, t, 0.08)
            engineOsc.frequency.setTargetAtTime(55 + 130 * ratio, t, 0.08)
        },
        setSiren(amount) {
            if (!ctx || paused) return
            sirenGain.gain.setTargetAtTime(0.05 * amount, ctx.currentTime, 0.2)
        },
    }
}

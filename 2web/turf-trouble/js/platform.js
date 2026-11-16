// Thin wrapper around the 2Web SDK. When the game is opened on its own (no SDK),
// every call does nothing and ads come back "not shown".

const sdk = () => {
    const t = window.TwoWeb
    return t && typeof t.ready === 'function' ? t : null
}

export const platform = {
    ready() {
        try { sdk()?.ready() } catch { /* standalone */ }
    },
    onPause(cb) {
        try { sdk()?.onPause(cb) } catch { /* standalone */ }
    },
    async ad(type) {
        const t = sdk()
        if (!t || typeof t.ad !== 'function') return { rewarded: false }
        try {
            const r = await t.ad(type)
            return { rewarded: !!r && r.rewarded === true }
        } catch {
            return { rewarded: false }
        }
    },
    score(points) {
        try { sdk()?.score?.(Math.max(0, Math.round(points))) } catch { /* standalone */ }
    },
}

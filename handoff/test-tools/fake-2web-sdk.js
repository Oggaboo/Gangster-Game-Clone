// Stand-in for the real 2Web SDK, for local testing only (labelled fake ads).
(function () {
    const pauseCbs = [], log = []
    const fire = (p) => pauseCbs.forEach((cb) => cb(p))
    window.TwoWeb = {
        _log: log,
        ready() { log.push('ready') },
        onPause(cb) { pauseCbs.push(cb) },
        ad(type) {
            log.push('ad:' + type)
            return new Promise((resolve) => {
                const el = document.createElement('div')
                el.id = 'fake-ad'
                el.style.cssText = 'position:fixed;inset:0;z-index:99;background:#000c;color:#fff;font:700 24px sans-serif;display:flex;align-items:center;justify-content:center'
                el.textContent = 'TEST AD (' + type + ')'
                document.body.append(el)
                fire(true)
                setTimeout(() => { el.remove(); fire(false); resolve({ rewarded: type === 'rewarded' }) }, window.__adMs || 3000)
            })
        },
        score(n) { log.push('score:' + n) },
    }
})()

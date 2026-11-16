#!/usr/bin/env python3
"""Checks the 2Web build against the porting rules that can be checked by machine,
then writes dist/<slug>-<version>.zip. Run from anywhere: python3 2web/package.py"""
import json, re, struct, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SLUG = 'turf-trouble'
SRC = HERE / SLUG
CATEGORIES = {'action', 'puzzle', 'racing', 'sports', 'casual', 'arcade', 'two-player', 'idle', 'strategy',
              'adventure', 'simulation', 'board', 'dress-up', 'io'}
fails = []


def check(rule, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + rule + (f'  ({detail})' if detail else ''))
    if not ok:
        fails.append(rule)


def image_size(path):
    data = path.read_bytes()
    if data[:4] == b'RIFF' and data[12:16] == b'VP8 ':
        w, h = struct.unpack('<HH', data[26:30])
        return w & 0x3fff, h & 0x3fff
    if data[:4] == b'RIFF' and data[12:16] == b'VP8L':
        b = struct.unpack('<I', data[21:25])[0]
        return (b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1
    if data[:4] == b'RIFF' and data[12:16] == b'VP8X':
        return 1 + int.from_bytes(data[24:27], 'little'), 1 + int.from_bytes(data[27:30], 'little')
    if data[:2] == b'\xff\xd8':
        i = 2
        while i < len(data):
            marker, length = data[i + 1], struct.unpack('>H', data[i + 2:i + 4])[0]
            if marker in (0xc0, 0xc1, 0xc2):
                h, w = struct.unpack('>HH', data[i + 5:i + 9])
                return w, h
            i += 2 + length
    return None


files = sorted(p for p in SRC.rglob('*') if p.is_file())
names = [p.relative_to(SRC).as_posix() for p in files]
listing = json.loads((SRC / '2web.json').read_text())
version = listing['version']

# section 1
for need in ('index.html', '2web.json', 'thumb.webp', 'cover.jpg'):
    check(f'1: {need} present', need in names)
check('1: slug is lowercase letters, digits, dashes', re.fullmatch(r'[a-z0-9-]+', listing['slug']) and listing['slug'] == SLUG)
check('1: no junk files', not any(re.search(r'__MACOSX|node_modules|\.DS_Store|\.map$|\.ts$', n) for n in names))

# section 2
total = sum(p.stat().st_size for p in files)
check('2.4: each file <= 25 MB', all(p.stat().st_size <= 25e6 for p in files))
check('2.4: whole game <= 50 MB, <= 500 files', total <= 50e6 and len(files) <= 500, f'{total / 1e6:.2f} MB, {len(files)} files')
own = [p for p in files if p.suffix in ('.html', '.css', '.js') and 'lib/' not in p.as_posix()]
text = {p.relative_to(SRC).as_posix(): p.read_text() for p in own}
all_text = '\n'.join(text.values())
check('2.2: relative paths only', not re.search(r'''(src|href)=["']/|url\(\s*["']?/|from\s+["']/|import\(["']/''', all_text))
remote = sorted(set(re.findall(r'''https?://[^\s"'`)]+''', all_text)))
check('2.3: nothing loaded from the internet', not remote and not re.search(r'\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon', all_text), ', '.join(remote))
lib = '\n'.join(p.read_text(errors='ignore') for p in files if 'lib/' in p.as_posix() and p.suffix == '.js')
check('2.3: bundled library makes no network calls on its own', not re.search(r'sendBeacon|WebSocket\(|googletagmanager|analytics', lib))
check('2.5: no popups, alerts, forms or links out', not re.search(r'window\.open|(?<![.\w])(alert|confirm|prompt)\(|<form|<a\s|location\.(href|assign|replace)|target=', all_text))
keys = re.findall(r'''localStorage\.\w+\(([^)]*)\)''', all_text)
check('2.6: saves use the "<slug>:" prefix, no cookies, no IndexedDB',
      all('${SLUG}:' in k for k in keys) and "const SLUG = 'turf-trouble'" in all_text
      and not re.search(r'document\.cookie|indexedDB|sessionStorage|localStorage\.clear|localStorage\.key', all_text), f'{len(keys)} storage calls')
check('2.8: shows its version', 'console.log(`Turf Trouble ${VERSION}`)' in all_text and f"const VERSION = '{version}'" in all_text)
check('2.9: exposes window.__game', 'window.__game' in all_text)

# section 3
html = text['index.html']
sdk = '<script src="../../sdk/2web.js"></script>'
check('3: SDK line present, exactly as written, before the game scripts', sdk in html and html.index(sdk) < html.index('js/main.js') and html.count('<script') == 2)
check('3: SDK file is not copied into the zip', not any(n.endswith('2web.js') for n in names))
for call in ('ready', 'onPause', 'ad', 'score'):
    check(f'3: uses TwoWeb.{call}', re.search(rf'platform\.{call}\(', all_text) is not None)
check('3: rewarded button labelled "▶ WATCH AD: <reward>"', '`▶ WATCH AD: ' in all_text)
check('5.5/4.4: no other ad code, no fullscreen button', not re.search(r'adsbygoogle|gamemonetize|playgama|poki|crazygames|requestFullscreen', all_text, re.I))

# section 6
d = listing.get('description', '')
check('6: title is plain', not re.search(r'free|online|20\d\d|\bhd\b', listing['title'], re.I) and listing['title'].isascii())
check('6: description 80-300 characters, 1-3 sentences', 80 <= len(d) <= 300 and 1 <= len(re.findall(r'[.!?](\s|$)', d)) <= 3, f'{len(d)} chars')
check('6: controls cover keyboard and touch', 'touch' in listing['controls'].lower() and 'WASD' in listing['controls'])
check('6: 1-3 known categories', 1 <= len(listing['categories']) <= 3 and set(listing['categories']) <= CATEGORIES)
check('6: 3-6 lowercase tags', 3 <= len(listing['tags']) <= 6 and all(re.fullmatch(r'[a-z]+', t) for t in listing['tags']))
check('6: rating and note', listing['rating'] in ('everyone', '12') and (listing['rating'] != '12' or listing['ratingNote']))

# section 7
thumb, cover = SRC / 'thumb.webp', SRC / 'cover.jpg'
check('7: thumb.webp is 512 x 512, under 150 KB', image_size(thumb) == (512, 512) and thumb.stat().st_size < 150e3, f'{image_size(thumb)}, {thumb.stat().st_size // 1000} KB')
check('7: cover.jpg is 1280 x 720, under 300 KB', image_size(cover) == (1280, 720) and cover.stat().st_size < 300e3, f'{image_size(cover)}, {cover.stat().st_size // 1000} KB')
check('7: no video files', not any(n.endswith(('.mp4', '.webm', '.mov')) for n in names))

if fails:
    print(f'\n{len(fails)} rule(s) failed, no zip written.')
    sys.exit(1)

out = HERE / 'dist' / f'{SLUG}-{version}.zip'
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p, n in zip(files, names):
        info = zipfile.ZipInfo(f'{SLUG}/{n}', date_time=(2026, 11, 16, 0, 0, 0))   # fixed date: same input, same zip
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, p.read_bytes())
print(f'\nAll checks passed. Wrote {out.relative_to(HERE.parent)} ({out.stat().st_size / 1e3:.0f} KB, {len(files)} files).')

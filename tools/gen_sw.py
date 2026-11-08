"""Generate sw.js (offline support) with the list of app files and a version-based cache name.
Run after changing files:  python tools/gen_sw.py"""
import pathlib, hashlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
files = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/style.css', 'css/cockpit.css', 'css/v2.css', 'css/v3.css']
files += sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / 'js').rglob('*.js'))
h = hashlib.sha256()
for f in files[1:]:
    h.update((ROOT / f).read_bytes())
version = h.hexdigest()[:10]
tpl = (ROOT / 'tools' / 'sw.template.js').read_text(encoding='utf-8')
out = tpl.replace('__VERSION__', version).replace('__FILES__', ',\n  '.join("'" + f + "'" for f in files))
(ROOT / 'sw.js').write_text(out, encoding='utf-8')
print('sw.js', version, len(files), 'files')

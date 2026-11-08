"""Build the standalone עין טובה site for Netlify into dist/netlify (drag that folder to app.netlify.com/drop)."""
import shutil, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'dist' / 'netlify'
if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)
for name in ['index.html', 'manifest.webmanifest', 'icon.svg', 'netlify.toml']:
    shutil.copy2(root / name, out / name)
for d in ['css', 'js']:
    shutil.copytree(root / d, out / d)
(out / 'netlify.toml').write_text((root / 'netlify.toml').read_text(encoding='utf-8').replace('publish = "."', 'publish = "."'), encoding='utf-8')
files = sum(1 for _ in out.rglob('*') if _.is_file())
print(f'built {out} ({files} files)')

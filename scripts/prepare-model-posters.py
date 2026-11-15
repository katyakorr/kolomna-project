"""Rebuild lightweight website posters from the approved model screenshots.

Run from the project root: python3 scripts/prepare-model-posters.py
Requires Pillow only for rebuilding posters; normal npm start does not.
"""
import json
import subprocess
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
assets = json.loads(subprocess.check_output(
    ['node', '-e', "console.log(JSON.stringify(require('./backend/models').assets))"],
    cwd=ROOT, text=True))
for asset in assets:
    output = Path(asset['posterFile'])
    output.parent.mkdir(parents=True, exist_ok=True)
    image = Image.open(asset['posterSource']).convert('RGB')
    image.thumbnail((640, 640), Image.Resampling.LANCZOS)
    image.save(output, 'WEBP', quality=82, method=6)
    print(f"{asset['slug']}: {output.stat().st_size:,} bytes")

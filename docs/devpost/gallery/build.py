#!/usr/bin/env python3
"""Rebuild captioned submission PNGs from existing, real E2E screenshots.
Requires ffmpeg with drawtext and DejaVu Sans. Run from any working directory.
No screenshot contents, routing values, or generated text are reconstructed.
"""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
FONT = '/usr/share/fonts/TTF/DejaVuSans.ttf'
if not Path(FONT).exists():
    FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
# name, source, crop x/y/w/h, title, explanatory caption
CARDS = [
 ('01-capture.png', 'integration-rules-only.png', (58, 695, 940, 740),
  '01 / Capture the blocked control',
  'Real extension handoff / synthetic checkout / navigation keys, not typed text'),
 ('02-private-draft.png', 'real-06-cloud-plan.png', (58, 1740, 940, 1020),
  '02 / Review the on-device draft',
  'Real Nano output / editable report / generated wording needs human review'),
 ('03-sharing-preview.png', 'real-06-cloud-plan.png', (58, 2810, 940, 850),
  '03 / Inspect what will be shared',
  'Approved JSON only / raw screenshot and original note excluded'),
 ('04-cloud-plan.png', 'real-06-cloud-plan.png', (58, 3680, 940, 920),
  '04 / Request cloud repair guidance',
  'Real cloud call / returned W3C sources / illustrative code, not an automatic patch'),
 ('05-hybrid-routing.png', 'real-10-owner-verified.png', (1040, 1340, 345, 615),
  '05 / See where each step ran',
  'On-device: 0 cloud bytes / Cloud: 1892 payload bytes / not total network traffic'),
 ('06-verification.png', 'real-10-owner-verified.png', (58, 1780, 940, 470),
  '06 / Close the repair loop',
  'Real Firestore lifecycle / synthetic fixed-fixture check / not WCAG certification'),
]

def render(dest, source, crop, title, caption):
    x,y,w,h = crop
    # Fit the unmodified screenshot crop on a 3:2 canvas, with two caption bands.
    vf = (f'crop={w}:{h}:{x}:{y},scale=1380:760:force_original_aspect_ratio=decrease,'
          'pad=1500:1000:(ow-iw)/2:150+(760-ih)/2:color=0xf3f5ed,'
          'drawbox=x=0:y=0:w=iw:h=130:color=0x123c35:t=fill,'
          'drawbox=x=0:y=930:w=iw:h=70:color=0x123c35:t=fill,'
          f"drawtext=fontfile={FONT}:text='{title}':fontcolor=white:fontsize=42:x=60:y=43,"
          f"drawtext=fontfile={FONT}:text='{caption.replace(':', chr(92)+':')}':fontcolor=white:fontsize=24:x=(w-tw)/2:y=951")
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',
                    str(ROOT/'tools/e2e/out'/source),'-vf',vf,'-frames:v','1',
                    '-update','1',str(dest)],check=True)

for name, source, crop, title, caption in CARDS:
    render(OUT/name, source, crop, title, caption)
render(OUT.parent/'cover.png', 'real-10-owner-verified.png', (1040,1340,345,615),
       'BarrierRelay / Private capture. Shared repair.',
       'Firebase AI Logic / on-device drafting + approved cloud repair planning')
print('Rendered six gallery PNGs and cover.png at 1500 x 1000.')

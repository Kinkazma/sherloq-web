"""Owned, deterministic rich96MP fixture with gutters, text and a real reflection."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'.build/m3'
source=Image.open(out/'m3-96mp-noise-copy.jpg').convert('RGB')
panel=source.crop((0,0,3840,7840));del source
draw=ImageDraw.Draw(panel);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',90)
for x,y,text in [(140,160,'SHERLOQ PUBLIC TEST'),(1600,3600,'COPY MOVE 96 MP'),(180,6900,'GLOBAL PIXEL COORDINATES')]:
 draw.rectangle((x-24,y-18,x+1750,y+135),fill='white');draw.text((x,y),text,font=font,fill='black')
image=Image.new('RGB',(12000,8000),'white')
for i,x in enumerate([120,4080,8040]):image.paste(panel.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if i==2 else panel,(x,80))
path=out/'m3-96mp-panels.jpg';image.save(path,quality=90,subsampling=0)
raw=path.read_bytes();metadata=dict(file=path.name,width=12000,height=8000,description='Deterministic rich RGB noise panels with native white gutters, three large text boxes per panel, second panel copied and third reflected horizontally. JPEG90 4:4:4.',panels=[[120,80,3960,7920],[4080,80,7920,7920],[8040,80,11880,7920]],sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw))
(out/'m3-96mp-panels.json').write_text(json.dumps(metadata,indent=2)+'\n');print(json.dumps(metadata))

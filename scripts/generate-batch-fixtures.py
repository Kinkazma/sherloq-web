#!/usr/bin/env python3
"""Small synthetic fixtures; no scientific claim, no site or model copies."""
from pathlib import Path
import argparse, zipfile
from PIL import Image
from reportlab.pdfgen import canvas

parser=argparse.ArgumentParser()
parser.add_argument('directory',type=Path)
args=parser.parse_args()
args.directory.mkdir(parents=True,exist_ok=True)
repository=Path(__file__).resolve().parents[1]
with Image.open(repository/'examples/spiral/edited.png') as source:
 source.thumbnail((480,480))
 source.convert('RGB').save(args.directory/'acquisition.jpg',quality=90)
 source.convert('RGB').save(args.directory/'acquisition.tiff',compression='tiff_lzw')
for name in ['etude-a.pdf','A_VERIFIER_C1_A0_etude-b.pdf']:
 document=canvas.Canvas(str(args.directory/name),pagesize=(595,842))
 document.drawString(50,790,'SHERLOQ - synthetic extraction fixture')
 document.drawImage(str(args.directory/'acquisition.jpg'),80,300,width=360,height=360)
 document.showPage()
 document.saveState();document.translate(150,290);document.rotate(20)
 document.drawImage(str(args.directory/'acquisition.jpg'),0,0,width=280,height=280)
 document.restoreState();document.drawString(50,790,'Repeated acquisition, rotated placement')
 document.showPage();document.save()
with zipfile.ZipFile(args.directory/'lot-de-validation.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for name in ['etude-a.pdf','A_VERIFIER_C1_A0_etude-b.pdf','acquisition.jpg']:
  archive.write(args.directory/name,name)
print(args.directory/'lot-de-validation.zip')

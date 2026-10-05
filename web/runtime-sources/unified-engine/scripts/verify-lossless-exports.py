"""Independent native decoding of browser lossless exports (no user images)."""
from pathlib import Path
import json, hashlib, subprocess
from PIL import Image
root=Path(__file__).resolve().parents[1]/'.build/lossless-exports'
width,height=257,193
expected=bytearray(width*height*3);seed=42
for i in range(len(expected)):
    seed=(seed^(seed<<13))&0xffffffff
    seed^=seed>>17
    seed=(seed^(seed<<5))&0xffffffff
    expected[i]=seed&255
cases=[]
for kind in ['chrome','firefox','webkit']:
    for fmt in ['webp','png','avif','tiff','heic']:
        file=root/f'lossless-{kind}.{fmt}'
        if fmt in ['webp','png','tiff']:
            image=Image.open(file);assert image.size==(width,height)
            if fmt=='tiff':
                assert image.tag_v2[258]==(8,8,8)
                assert image.tag_v2[259]==8 # Adobe Deflate, not uncompressed.
                assert image.tag_v2[277]==3
                assert image.tag_v2[317]==2
            decoded=image.convert('RGB').tobytes();decoder='Pillow native codec'
        else:
            result=subprocess.run(['magick',str(file),'-depth','8','rgb:-'],capture_output=True,check=True)
            decoded=result.stdout;decoder='Native ImageMagick/libheif'
        assert decoded==expected,(kind,fmt,len(decoded))
        cases.append(dict(browser=kind,format=fmt,bytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),decodedPixelsEqual=True,decoder=decoder))
report=dict(width=width,height=height,rgbSha256=hashlib.sha256(expected).hexdigest(),tiff=dict(bitsPerSample=[8,8,8],samplesPerPixel=3,compression='Deflate',predictor=2),cases=cases)
(root/'native-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),exact=True,tiff=report['tiff'])))

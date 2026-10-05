"""Make real synthetic image fixtures; never merely rename a PPM as JP2/JXL.

Requires Pillow/OpenJPEG, a native libjxl development installation and clang.
On macOS the libjxl prefix defaults to Homebrew; pass --prefix elsewhere.
The JXL helper avoids unrelated broken dependencies of a system cjxl executable.
"""
from pathlib import Path
from PIL import Image
import argparse
import subprocess
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--prefix',default='/opt/homebrew');args=p.parse_args()
out=root/'.build/media-fixtures';out.mkdir(parents=True,exist_ok=True)
pixels=bytes(v for y in range(193) for x in range(257) for v in (round(255*x/256),round(255*y/192),192 if (x//16+y//16)%2 else 32))
image=Image.frombytes('RGB',(257,193),pixels)
for extension,format in [('ppm','PPM'),('bmp','BMP'),('gif','GIF'),('tif','TIFF'),('jp2','JPEG2000')]:
    image.save(out/('reference.'+extension),format=format)
image.save(out/'reference.jpg',format='JPEG',quality=95,subsampling=1)
# PSD's native writer and the JXL helper preserve exactly the same SDR raster.
subprocess.run(['magick',str(out/'reference.ppm'),'PSD:'+str(out/'reference.psd')],check=True)
prefix=Path(args.prefix);helper=out/'jxl-fixture'
subprocess.run(['clang','-Wno-nullability-completeness',str(root/'tests/support/media-jxl-fixture.c'),'-I'+str(prefix/'include'),'-L'+str(prefix/'lib'),'-ljxl','-o',str(helper)],check=True)
subprocess.run([str(helper),str(out/'reference.ppm'),str(out/'reference.jxl')],check=True)
assert (out/'reference.jp2').read_bytes()[:12]==bytes.fromhex('0000000c6a5020200d0a870a')
assert (out/'reference.jxl').read_bytes()[:2]==bytes.fromhex('ff0a')

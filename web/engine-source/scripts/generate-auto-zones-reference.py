"""Public deterministic panel-detection oracle; native source is read-only."""
from pathlib import Path
import gzip, hashlib, json, struct, sys
import cv2 as cv
import numpy as np

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent / 'source'))
from gui.sherloq_app.core.auto_zones import detect_panels
assert cv.__version__ == '4.11.0' and np.__version__ == '1.26.4'
rng = np.random.default_rng(270001)
images = []
for h, w in [(1,1),(15,23),(16,24),(17,25),(97,131),(129,1800),(131,1801),(133,3601),(1024,1031),(1,4001),(4001,1)]:
    images.append((f'flat-{w}-{h}', np.full((h,w,3),127,np.uint8)))
    images.append((f'noise-{w}-{h}', rng.integers(0,256,(h,w,3),dtype=np.uint8)))
for gap in [0,1,2,3,4,7,16]:
    for color in [(0,0,0),(255,255,255),(23,177,91)]:
        a = np.empty((193,257,3),np.uint8); a[:] = color
        for y0,y1,x0,x1 in [(7,85,9,118),(7,85,118+gap,247),(85+gap,184,9,118),(85+gap,184,118+gap,247)]:
            a[y0:y1,x0:x1] = rng.integers(30,225,(y1-y0,x1-x0,3),dtype=np.uint8)
        images.append((f'grid-{gap}-{color[0]}',a))
for w,h in [(97,79),(1801,129),(1031,1024)]:
    for kind in ['outer-edges','asymmetric','tie-palette','broken-gutter']:
        a = np.zeros((h,w,3),np.uint8); a[:] = (32,96,160)
        a[:h//2-3,:w//2-3] = rng.integers(0,256,(h//2-3,w//2-3,3),dtype=np.uint8)
        a[h//2+3:,w//2+3:] = rng.integers(0,256,(h-(h//2+3),w-(w//2+3),3),dtype=np.uint8)
        if kind == 'asymmetric': a[5:h//2-5,w//2+7:w-5] = (160,96,32)
        if kind == 'tie-palette':
            a[:h//2,:] = (0,0,248); a[h//2:,:] = (248,0,0)
            a[8:h//2-8,7:w-7] = 127; a[h//2+8:h-8,7:w-7] = 127
        if kind == 'broken-gutter': a[h//2-4:h//2+5,w//2-4:w//2+5] = 127
        images.append((f'{kind}-{w}-{h}',a))
# The retained palette is only eight bins, in stable BGR code order at a tie.
for count in [7,8,9,12]:
    for reverse in [False,True]:
        a = np.zeros((101,70*count,3),np.uint8)
        for i in range(count):
            c = count-1-i if reverse else i
            a[:,i*70:(i+1)*70] = ((c*24)%256, (c*56)%256, (c*88)%256)
            a[15:86,i*70+12:(i+1)*70-12] = rng.integers(0,256,(71,46,3),dtype=np.uint8)
        images.append((f'palette-{count}-{int(reverse)}',a))
# Flat-neighbour <=2, median truncation, colour distance <=14, minimum sizes.
for delta in [1,2,3,7,14,15]:
    a = np.full((83,127,3),64,np.uint8)
    a[::2,:,:] += min(delta,7)
    a[18:65,25:103] = 64+delta
    images.append((f'flat-median-distance-{delta}',a))
for bw,bh in [(23,16),(24,15),(24,16),(25,16),(24,17),(60,40)]:
    for delta in [14,15]:
        a = np.full((91,133,3),64,np.uint8); a[11:11+bh,13:13+bw] = 64+delta
        images.append((f'minimum-{bw}-{bh}-delta-{delta}',a))
# Occupancy and border tests around their native thresholds; morphology remains on.
for removed in [170,179,180,181,190]:
    a = np.zeros((101,141,3),np.uint8); a[20:40,20:70] = 120
    for j in range(removed): a[20+j//50,20+j%50] = 0
    a[20:40,20] = 120; a[20:40,69] = 120
    images.append((f'occupancy-{removed}',a))
for bad in [17,18,19,20]:
    a = np.zeros((101,141,3),np.uint8); a[20:60,20:70] = 120
    a[18:20,20:20+bad] = 90
    images.append((f'border-{bad}',a))
for dy in [3,4,5,6]:
    a = np.zeros((201,301,3),np.uint8)
    a[10+dy:60+dy,10:90] = 100; a[10:60,120:200] = 150
    a[85:135,20:100] = 200
    images.append((f'row-order-{dy}',a))
for kind in ['diagonal-contact','ring','almost-full','full','single-hole','holes-2','holes-3']:
    a = np.zeros((100,140,3),np.uint8); a[5:95,5:135] = 120
    if kind == 'diagonal-contact':
        a[:] = 0; a[10:40,10:60] = 120; a[40:70,60:110] = 120
    if kind == 'ring': a[15:85,15:125] = 0
    if kind == 'almost-full': a[1:99,1:139] = 120
    if kind == 'full': a[:] = 120
    if kind == 'single-hole': a[50,70] = 0
    if kind.startswith('holes-'):
        size = int(kind[-1])
        for y in range(20,80,10):
            for x in range(20,120,10): a[y:y+size,x:x+size] = 0
    images.append((kind,a))
for i in range(24):
    h,w = map(int,rng.integers([70,90],[301,401]))
    a = np.empty((h,w,3),np.uint8); a[:] = rng.integers(0,256,3)
    for _ in range(int(rng.integers(1,8))):
        x,y = int(rng.integers(0,w-25)),int(rng.integers(0,h-17))
        bw,bh = int(rng.integers(23,w-x+1)),int(rng.integers(15,h-y+1))
        a[y:y+bh,x:x+bw] = rng.integers(0,256,(bh,bw,3),dtype=np.uint8)
    images.append((f'random-overlap-{i}',a))

inputs = []
for name,a in images:
    ok, encoded = cv.imencode('.png',a); assert ok
    inputs.append((name,encoded.tobytes(),'image/png'))
a = next(image for name,image in images if name=='grid-7-255')
for quality in [70,95]:
    ok, jpg = cv.imencode('.jpg',a,[cv.IMWRITE_JPEG_QUALITY,quality,cv.IMWRITE_JPEG_PROGRESSIVE,1]); assert ok
    inputs.append((f'progressive-{quality}',jpg.tobytes(),'image/jpeg'))
    for orientation in [2,3,4,5,6,7,8]:
        exif = b'Exif\0\0II'+struct.pack('<HIH',42,8,1)+struct.pack('<HHI',0x112,3,1)+struct.pack('<H',orientation)+b'\0\0'+struct.pack('<I',0)
        data = jpg[:2].tobytes()+b'\xff\xe1'+struct.pack('>H',len(exif)+2)+exif+jpg[2:].tobytes()
        inputs.append((f'jpeg-{quality}-orientation-{orientation}',data,'image/jpeg'))
for name,a in [('rgb16',a.astype(np.uint16)*256+rng.integers(0,256,a.shape,dtype=np.uint16)),('gray16',cv.cvtColor(a,cv.COLOR_BGR2GRAY).astype(np.uint16)*256),('rgba8',np.dstack((a,rng.integers(0,256,a.shape[:2],dtype=np.uint8))))]:
    ok, tiff = cv.imencode('.tiff',a); assert ok
    inputs.append((f'tiff-{name}',tiff.tobytes(),'image/tiff'))

payload = bytearray(); records = []
for name,encoded,mime in inputs:
    image = cv.imdecode(np.frombuffer(encoded,np.uint8),cv.IMREAD_COLOR)
    assert image is not None
    rgb = cv.cvtColor(image,cv.COLOR_BGR2RGB).tobytes()
    source = dict(offset=len(payload),length=len(encoded),sha256=hashlib.sha256(encoded).hexdigest()); payload.extend(encoded)
    pixels = dict(offset=len(payload),length=len(rgb),sha256=hashlib.sha256(rgb).hexdigest()); payload.extend(rgb)
    polygons = detect_panels(image)
    records.append(dict(name=name,width=image.shape[1],height=image.shape[0],mime=mime,source=source,pixels=pixels,polygons=polygons))
    print(name,len(polygons),flush=True)
compressed = gzip.compress(payload,compresslevel=9,mtime=0)
out = root/'fixtures/auto-zones'; out.mkdir(exist_ok=True)
(out/'reference.bin.gz').write_bytes(compressed)
source = root.parent/'source/gui/sherloq_app/core/auto_zones.py'
reference = dict(schema=1,seed=270001,native=dict(numpy=np.__version__,opencv=cv.__version__,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest()),payload=dict(bytes=len(payload),compressedBytes=len(compressed),sha256=hashlib.sha256(payload).hexdigest(),compressedSha256=hashlib.sha256(compressed).hexdigest()),cases=records)
(out/'reference.json').write_text(json.dumps(reference,indent=2)+'\n')
print(len(records),'generated original-byte cases',len(payload),'raw bytes',len(compressed),'compressed bytes')

"""Native keypoint/descriptors oracle on generated, redistributable fields only."""
from pathlib import Path
import argparse, hashlib, json, sys
import numpy as np
import cv2 as cv
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root.parent/'source'))
from gui.sherloq_app.core.cloning import CloningEngine
assert np.__version__ == '1.26.4' and cv.__version__ == '4.11.0'
parser=argparse.ArgumentParser();parser.add_argument('--large',action='store_true');args=parser.parse_args()
out = root/'.build/cloning-study'
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(250001)
images = [('flat', np.full((96, 128, 3), 127, np.uint8)),
          ('tiny', rng.integers(0, 256, (7, 9, 3), dtype=np.uint8))]
for h, w in [(32, 37), (64, 80), (127, 193), (256, 320), (384, 512)]:
    image = rng.integers(0, 256, (h, w, 3), dtype=np.uint8)
    images.append((f'noise-{w}-{h}', image))
    if h >= 127:
        image = cv.GaussianBlur(image, (5, 5), .7)
        height, width = h//3, w//3
        image[h//2:h//2+height, w//2:w//2+width] = image[4:4+height, 7:7+width]
        images.append((f'clone-{w}-{h}', image))
y, x = np.mgrid[:257, :319]
checker = ((((x//13 + y//17) % 2)*190+30)).astype(np.uint8)
images.append(('checker', cv.cvtColor(checker, cv.COLOR_GRAY2BGR)))
shapes = np.zeros((257, 319, 3), np.uint8)
for _ in range(100):
    center = tuple(int(n) for n in rng.integers([0, 0], [319, 257]))
    cv.circle(shapes, center, int(rng.integers(2, 19)), tuple(int(n) for n in rng.integers(0, 256, 3)), -1, cv.LINE_AA)
images.append(('shapes', shapes))
if args.large:
    noise=rng.integers(0,256,(1024,1031,3),dtype=np.uint8)
    images.append(('large-noise',noise))
    clone=cv.GaussianBlur(noise,(5,5),.7)
    clone[550:900,600:950]=clone[30:380,40:390]
    images.append(('large-clone',clone))
    rotated=clone.copy();rotated[550:900,600:950]=np.rot90(clone[30:380,40:390])
    images.append(('large-rotated',rotated))
    ly,lx=np.mgrid[:1024,:1031]
    repeated=(((lx//13+ly//17)%2)*190+30).astype(np.uint8)
    images.append(('large-checker',cv.cvtColor(repeated,cv.COLOR_GRAY2BGR)))
records = []
for image_index, (name, image) in enumerate(images):
    h, w = image.shape[:2]
    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
    gray_file = f'{image_index}.gray'
    gray.tofile(out/gray_file)
    cv.cvtColor(image, cv.COLOR_BGR2RGB).tofile(out/f'{image_index}.rgb')
    engine = CloningEngine(image)
    masks = [('all', None), ('empty', np.zeros((h, w), np.uint8))]
    half = np.zeros((h, w), np.uint8); half[:, :w//2] = 1
    masks.append(('half', half))
    irregular = np.zeros((h, w), np.uint8)
    irregular[::2, 1::3] = 255
    masks.append(('sparse', irregular))
    results = []
    for mask_id, (mask_name, mask) in enumerate(masks):
        mask_file = None
        if mask is not None:
            mask_file = f'{image_index}-{mask_name}.mask'; mask.tofile(out/mask_file)
        for algorithm in ([1] if name.startswith('large-') else range(3)):
            prefix = f'{image_index}-{mask_name}-{algorithm}'
            try:
                points, desc = engine.detect(algorithm, mask_id, mask, lambda: False)
                points.astype('<f8').tofile(out/(prefix+'.f64')); desc.tofile(out/(prefix+'.desc'))
                result = dict(count=len(points), descriptorSize=desc.shape[1], points=prefix+'.f64', descriptors=prefix+'.desc')
            except cv.error as error:
                result = dict(error=str(error).split('\n')[0])
            result.update(algorithm=algorithm, mask=mask_name, maskFile=mask_file)
            results.append(result)
    records.append(dict(name=name, width=w, height=h, gray=gray_file, rgb=f'{image_index}.rgb', results=results))
source = root.parent/'source/gui/sherloq_app/core/cloning.py'
(out/'reference.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), numpy=np.__version__, opencv=cv.__version__, images=records), indent=2)+'\n')
print(f'{len(images)} images, {sum(len(x["results"]) for x in records)} detector cases')

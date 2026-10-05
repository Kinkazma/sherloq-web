"""Synthetic Wiener/NCC and HDF5 snapshot oracles; never reads user images."""
from pathlib import Path
import sys, json, hashlib, warnings, shutil
import numpy as np
import cv2 as cv
import scipy
from scipy.signal import choose_conv_method, correlate
import h5py

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'source'))
from gui.sherloq_app.core import prnu

OUT = ROOT / 'web-engine/fixtures'
BUILD = ROOT / 'web-engine/.build/prnu-reference'
BUILD.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(290926)
digest = lambda data: hashlib.sha256(data).hexdigest()
cases, pairs, databases = [], [], []
existing = json.loads((OUT / 'comparison-reference.json').read_text())['cases']
for case in existing:
    name, w, h = case['name'], case['width'], case['height']
    rgb = np.frombuffer((OUT / case['first']).read_bytes(), np.uint8).reshape(h, w, 3)
    gray = cv.cvtColor(rgb, cv.COLOR_RGB2GRAY).astype(np.float64) / 255
    row = dict(name=name, width=w, height=h, file=case['first'])
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            residual = prnu.extract_residual(gray)
        data = residual.astype('<f8').tobytes()
        file = f'prnu-{name}-residual.f64'
        (OUT / file).write_bytes(data)
        row.update(residual=file, residualSha256=digest(data), shape=list(residual.shape),
                   method=choose_conv_method(gray, np.ones((3, 3)), 'same'),
                   noisePower=float(np.mean(correlate(gray**2,np.ones((3,3)),'same')/9-(correlate(gray,np.ones((3,3)),'same')/9)**2)),
                   minimum=float(residual.min()), maximum=float(residual.max()))
    except ValueError as exc:
        row['error'] = str(exc)
    cases.append(row)

def pair(name, a, b):
    score = prnu.ncc(a, b)
    pairs.append(dict(name=name, first=dict(shape=list(a.shape), values=a.ravel().tolist()),
                      second=dict(shape=list(b.shape), values=b.ravel().tolist()),
                      score=score, reachesThreshold=score >= prnu.NCC_THRESHOLD))

a = np.array([[1., -1.], [1., -1.]])
b = np.array([[1., 1.], [-1., -1.]])
for rho in [-1., 0., .005-1e-14, .005-1e-15, .005, .005+1e-15, .005+1e-14, .01, 1.]:
    pair('correlation-' + repr(rho), a, rho*a + np.sqrt(1-rho*rho)*b)
for epsilon in [0., np.nextafter(5e-6, 0), 5e-6, np.nextafter(5e-6, np.inf), 1e-5]:
    pair('denominator-' + repr(epsilon), a*epsilon, a*epsilon)
pair('constant', np.ones((3, 5)), np.ones((4, 7)))
pair('crop', rng.normal(size=(7, 9)), rng.normal(size=(9, 5)))
pair('one-pixel', np.array([[3.]]), np.array([[7.]]))

# Recipes use only uint32 arithmetic and separately rounded binary64 operations,
# so Node and all browsers regenerate the identical input without a large blob.
def recipe_values(recipe):
    state = recipe['seed']
    values = []
    for i in range(int(np.prod(recipe['shape']))):
        state = (1664525*state+1013904223) & 0xffffffff
        value = (state/4294967295-.5)*recipe['scale']+recipe['offset']
        values.append(value)
    return np.array(values, np.float64).reshape(recipe['shape'])

large_pairs = []
for index, (shape_a, shape_b, scale, offset) in enumerate([
        ((1,8191),(1,8191),1.,0.), ((1,8192),(1,8192),1.,0.),
        ((1,8193),(1,8193),1.,0.), ((127,131),(129,137),.000001,.0003),
        ((193,179),(199,181),10.,1000.), ((1024,1024),(1022,1022),1.,0.),
        ((1024,1024),(1024,1024),1.,0.), ((301,281),(299,277),1e6,1e8)]):
    ra = dict(shape=shape_a,seed=738172+index,scale=scale,offset=offset)
    rb = dict(shape=shape_b,seed=93731+index,scale=scale,offset=offset)
    a,b = recipe_values(ra),recipe_values(rb)
    h,w = min(a.shape[0],b.shape[0]),min(a.shape[1],b.shape[1])
    ca,cb = a[:h,:w],b[:h,:w]
    score = prnu.ncc(a,b)
    large_pairs.append(dict(name='buffered-crop-'+str(index),first=ra,second=rb,
                            meanA=float(ca.mean()),meanB=float(cb.mean()),score=score,
                            reachesThreshold=score>=prnu.NCC_THRESHOLD))

training = BUILD / 'training'
training.mkdir(exist_ok=True)
patterns = {name: rng.integers(-15, 16, (97, 99), np.int16)
            for name in ['camera_alpha', 'camera_beta']}
inputs = []
for label, shapes in [('camera_alpha', [(91, 89), (93, 91), (89, 87)]),
                      ('camera_beta', [(95, 93), (91, 89)])]:
    for index, (h, w) in enumerate(shapes, 1):
        gray = (110 + patterns[label][:h, :w] + rng.integers(-3, 4, (h, w))).astype(np.uint8)
        path = training / f'{label}_{index}.jpg'
        cv.imwrite(str(path), gray, [cv.IMWRITE_JPEG_QUALITY, 98])
        file = 'prnu-training-' + path.name
        shutil.copyfile(path, OUT / file)
        inputs.append(dict(file=file, name=path.name, camera=label, sha256=prnu.file_digest(path)))

h, w = 91, 89
query = BUILD / 'query.jpg'
gray = (125 + patterns['camera_alpha'][:h, :w] + rng.integers(-3, 4, (h, w))).astype(np.uint8)
cv.imwrite(str(query), gray, [cv.IMWRITE_JPEG_QUALITY, 98])
shutil.copyfile(query, OUT / 'prnu-query.jpg')
query_bgr = cv.imread(str(query))
engine = prnu.PrnuEngine(query_bgr, str(query))
native_path = BUILD / 'snapshot.h5'
if native_path.exists(): native_path.unlink()  # Only this generator's disposable fixture.
by_name = {item['name']: item for item in inputs}
inputs = [by_name[Path(path).name] for paths in prnu.scan_dataset(str(training)).values() for path in paths]
prnu.build_database(str(native_path), str(training), excluded_path=str(query))
shutil.copyfile(native_path, OUT / 'prnu-snapshot.h5')

def database(name, path):
    row = dict(name=name, file=path.name, sha256=digest(path.read_bytes()))
    try:
        scores = prnu.PrnuEngine(query_bgr, str(query)).identify(str(path))
        row['scores'] = scores
        row['reachesThreshold'] = scores[0][1] >= prnu.NCC_THRESHOLD
        row['scoreTexts']=[f'{score:.5f}' for _,score in scores]
        gap=scores[0][1]-(scores[1][1] if len(scores)>1 else 0.)
        row['gapText']=f'{gap:.5f}' if len(scores)>1 else ''
        row['gapAboveHistoricalDisplayCutoff']=gap>.01
    except (ValueError, TypeError, KeyError) as exc:
        row['error'] = str(exc).replace(str(ROOT), '<native-root>')
    databases.append(row)

database('native-snapshot', OUT / 'prnu-snapshot.h5')
with h5py.File(native_path, 'r') as source:
    fingerprints = []
    for label in source:
        group = source[label]
        fp = group['fingerprint'][:]
        file = 'prnu-' + label + '-fingerprint.f64'
        (OUT / file).write_bytes(fp.astype('<f8').tobytes())
        fingerprints.append(dict(camera=label, file=file, shape=list(fp.shape),
                                 manifest=json.loads(group.attrs['training_manifest']),
                                 nImages=int(group.attrs['n_images']), nUsed=int(group.attrs['n_used'])))

for kind in ['legacy', 'incomplete', 'unknown-schema', 'empty', 'float32',
             'vector', 'nonfinite', 'query-in-training', 'missing-fingerprint']:
    path = OUT / f'prnu-database-{kind}.h5'
    with h5py.File(path, 'w') as f:
        if kind != 'legacy':
            f.attrs['schema'] = 'unknown' if kind == 'unknown-schema' else prnu.SCHEMA
            f.attrs['complete'] = kind != 'incomplete'
        if kind != 'empty':
            group = f.create_group('synthetic_camera')
            if kind != 'missing-fingerprint':
                fp = np.zeros((h-2, w-2), np.float64)
                if kind == 'float32': fp = fp.astype(np.float32)
                if kind == 'vector': fp = fp.ravel()
                if kind == 'nonfinite': fp[0, 0] = np.nan
                group.create_dataset('fingerprint', data=fp)
                group.attrs['training_manifest'] = json.dumps(
                    [dict(name=query.name, sha256=prnu.file_digest(query))] if kind == 'query-in-training' else [])
    database(kind, path)

for kind in ['legacy-untracked','complete-without-manifest','same-score-order','negative-score']:
    path=OUT/f'prnu-database-{kind}.h5'
    with h5py.File(path,'w') as f:
        if kind!='legacy-untracked':
            f.attrs['schema']=prnu.SCHEMA
            f.attrs['complete']=True
        names=['zeta','alpha','é','\ue000','🔬'] if kind=='same-score-order' else ['synthetic_camera']
        for name in names:
            group=f.create_group(name)
            fp=-prnu.extract_residual(prnu.load_image_gray(str(query))) if kind=='negative-score' else np.zeros((h-2,w-2),np.float64)
            group.create_dataset('fingerprint',data=fp)
    database(kind,path)

benchmark_case=next(x for x in cases if x['name']=='megapixel')
benchmark_rgb=np.frombuffer((OUT/benchmark_case['file']).read_bytes(),np.uint8).reshape(benchmark_case['height'],benchmark_case['width'],3)
benchmark_scores=prnu.PrnuEngine(benchmark_rgb[:,:,::-1],str(OUT/benchmark_case['file'])).identify(str(native_path))
report = dict(schema=1, nativeSchema=prnu.SCHEMA, threshold=prnu.NCC_THRESHOLD,
              versions=dict(numpy=np.__version__, scipy=scipy.__version__, opencv=cv.__version__, h5py=h5py.__version__),
              sourceSha256={'core/prnu.py': digest(Path(prnu.__file__).read_bytes())},
              cases=cases, nccPairs=pairs, nccLargePairs=large_pairs, training=inputs, fingerprints=fingerprints,
              query=dict(file='prnu-query.jpg', sha256=prnu.file_digest(query)), databases=databases,
              benchmark=dict(case='megapixel',scores=benchmark_scores))
(OUT / 'prnu-reference.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
print(json.dumps(dict(residualCases=len(cases), nccPairs=len(pairs), databases=len(databases),
                      cameraOrder=[x['camera'] for x in fingerprints], scores=databases[0]['scores'])))

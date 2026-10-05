"""Small synthetic native decision corpus. No models, downloads or shared writes.

Run with the native NumPy environment and PYTHONDONTWRITEBYTECODE=1.
Outputs only tests/data/forgeryscope under THIS worktree. Not neural parity.
"""
from pathlib import Path
import argparse, ast, hashlib, json, sys, types
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--native-root', type=Path, default=Path(__file__).resolve().parents[2])
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
relative = 'integration/clone_detectors/sherloq_clone_models/forgeryscope/matcher/lane.py'
source = (args.native_root / relative).read_text()
# The lane module imports no network runtime; its routines are unchanged.
module = types.ModuleType('forgeryscope_native_lane_decisions')
sys.modules[module.__name__] = module
exec(compile(source, relative, 'exec'), module.__dict__)
rng = np.random.default_rng(731024)
records = []
for case in range(6):
    panels = [('Blots', .9, .5, 1.25, 25.75, 18.5), ('Blots', .8, 29.5, 2.75, 59.75, 20.5)]
    lanes = []
    for i in range(10):
        p = i // 5
        x, y = (i % 5) * 3, (i % 2) * 2
        lanes.append(module.BlotLane(p, [x, y, x + 8, y + 9], np.zeros((9, 8, 3), np.uint8), i, panels[p]))
    embeddings = rng.normal(size=(10, 8)).astype(np.float32)
    embeddings[5:8] = embeddings[:3]
    skip = {(0, 1)} if case == 1 else set()
    groups = module.build_overlap_groups(lanes, overlap_threshold=5 if case < 3 else 8)
    threshold = .65 if case < 4 else -.2
    matches = module.find_best_match_between_groups(lanes, embeddings, groups, threshold, skip)
    normalized = embeddings / (np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8)
    scores = normalized @ normalized.T
    masks = module.create_lane_match_masks((24, 64, 3), matches, lanes)
    union = np.bitwise_or.reduce(masks) if masks else np.zeros((24, 64), np.uint8)
    records.append(dict(lanes=[dict(panel_idx=l.panel_idx, bbox=l.bbox, panel_bbox=l.panel_bbox) for l in lanes],
        threshold=threshold, overlapThreshold=5 if case < 3 else 8, skip=list(skip),
        groups=[sorted(g) for g in groups], scores=scores.tolist(), matches=[m.__dict__ for m in matches], union=union.flatten().tolist()))
# Exact threshold and area boundary cases, independent of random embeddings.
lanes = [module.BlotLane(i, [0, 0, 5, 5], None, i, ['Blots', 1., i*8, 0, i*8+5, 5]) for i in range(3)]
embeddings = np.array([[1,0], [.65, np.sqrt(1-.65**2)], [0,1]], np.float32)
normalized = embeddings / (np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8)
matches = module.find_best_match_between_groups(lanes, embeddings, [{0},{1},{2}], .65)
masks = module.create_lane_match_masks((8,24,3), matches, lanes)
records.append(dict(lanes=[dict(panel_idx=l.panel_idx,bbox=l.bbox,panel_bbox=l.panel_bbox) for l in lanes],threshold=.65,overlapThreshold=5,skip=[],groups=[[0],[1],[2]],scores=(normalized@normalized.T).tolist(),matches=[m.__dict__ for m in matches],union=np.bitwise_or.reduce(masks).flatten().tolist(),width=24,height=8))
report = dict(schema=1, scope='decision stages only; no neural inference', numpy=np.__version__,
    sources={relative: hashlib.sha256(source.encode()).hexdigest()}, cases=records)
out = root / 'tests/data/forgeryscope/decisions.json'
out.write_text(json.dumps(report, separators=(',',':'))+'\n')
print(f'{len(records)} native decision cases -> {out.relative_to(root)}')

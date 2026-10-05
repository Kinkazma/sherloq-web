"""Independent system fmaf reference for the portable SIMD FMA candidate.

Only deterministic synthetic floating-point values; no images or model weights.
The reference calls the host C math library, not the candidate's arithmetic.
"""
from pathlib import Path
import ctypes, hashlib, json, platform, subprocess
import numpy as np

root = Path(__file__).resolve().parents[1]
out = root / '.build/d2prl-fma'
out.mkdir(exist_ok=True)
source = out / 'native-reference.c'
source.write_text('#include <math.h>\n#include <stddef.h>\nvoid reference(const float*a,const float*b,const float*c,float*out,size_t n){for(size_t i=0;i<n;i++)out[i]=fmaf(a[i],b[i],c[i]);}\n')
library = out / ('native-reference.dylib' if platform.system() == 'Darwin' else 'native-reference.so')
subprocess.run(['cc', '-O3', '-ffp-contract=off', '-fno-builtin-fmaf', '-shared', str(source), '-o', str(library), '-lm'], check=True)
ref = ctypes.CDLL(str(library)).reference
pointer = np.ctypeslib.ndpointer(dtype=np.float32, flags='C_CONTIGUOUS')
ref.argtypes = [pointer, pointer, pointer, pointer, ctypes.c_size_t]
ref.restype = None
rng = np.random.default_rng(20260930)
records = []

def save(name, a, b, c):
    a, b, c = [np.ascontiguousarray(x, dtype=np.float32).reshape(-1) for x in (a, b, c)]
    assert len(a) == len(b) == len(c) and len(a) % 4 == 0
    assert all(np.isfinite(x).all() for x in (a, b, c))
    result = np.empty_like(a)
    ref(a, b, c, result, len(a))
    fields = {}
    for key, data in zip(('a', 'b', 'c', 'output'), (a, b, c, result)):
        file = out / f'{name}-{key}.bin'
        file.write_bytes(data.tobytes())
        fields[key] = dict(file=file.name, bytes=file.stat().st_size, sha256=hashlib.sha256(file.read_bytes()).hexdigest())
    records.append(dict(name=name, count=len(a), **fields))

for i in range(4):
    values = rng.integers(0, 2**32, size=(3, 524288), dtype=np.uint32)
    # Reject the NaN/Inf exponent while keeping all finite bit patterns possible.
    for v in values:
        bad = (v & 0x7f800000) == 0x7f800000
        while bad.any():
            v[bad] = rng.integers(0, 2**32, size=bad.sum(), dtype=np.uint32)
            bad = (v & 0x7f800000) == 0x7f800000
    save(f'finite-bits-{i}', *values.view(np.float32))

normal = rng.normal(size=(3, 262144)).astype(np.float32)
save('model-scale', *normal)
with np.errstate(over='ignore', under='ignore'):
    a = normal[0] * np.float32(2**40)
    b = normal[1] * np.float32(2**-20)
    c = -(a * b)
save('product-cancellation', a, b, c)

# Exact products at a binary32 midpoint, perturbed below binary64 precision.
# The naïve float64-product-plus-sum route rounds these twice incorrectly.
triples = []
for exponent in range(-50, 51):
    for odd in range(1, 64, 2):
        for sign in (-1, 1):
            for tiny_sign in (-1, 1):
                triples.append((sign * (1 + odd * 2**-23), 1.5 * 2**exponent, tiny_sign * 2**(exponent - 60)))
save('double-rounding-midpoints', *np.array(triples, dtype=np.float32).T)

edge_bits = np.array([0, 0x80000000, 1, 0x80000001, 0x007fffff, 0x807fffff,
                      0x00800000, 0x80800000, 0x3f000000, 0xbf000000,
                      0x3f800000, 0xbf800000, 0x3f800001, 0xbf800001,
                      0x7f7fffff, 0xff7fffff], dtype=np.uint32)
edges = edge_bits.view(np.float32)
save('zero-subnormal-overflow', *np.array(np.meshgrid(edges, edges, edges)).reshape(3, -1))
(out / 'reference.json').write_text(json.dumps(dict(schema=1, scope='Finite binary32 inputs, host system fmaf oracle; all output bits including signed zero, subnormals and infinity. Synthetic random and targeted double-rounding cases; no universal proof or model inference.', platform=platform.platform(), numpy=np.__version__, referenceSourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), records=records), indent=2) + '\n')
print(json.dumps(dict(cases=len(records), values=sum(r['count'] for r in records))))

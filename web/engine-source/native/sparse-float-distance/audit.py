"""Audit built sidecars before any imported engine memory is exposed."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import os

HERE = Path(__file__).resolve().parent
DIS = Path(os.environ.get('WASM_DIS', 'wasm-dis'))
source_sha = hashlib.sha256((HERE / 'distance.cpp').read_bytes()).hexdigest()
build = json.loads((HERE / 'build-proof.json').read_text())
assert build['sourceSha256'] == source_sha, 'Native source changed after build'
build_artifacts = {record['variant']: record for record in build['artifacts']}

def uleb(data, at):
    value = shift = 0
    while True:
        byte = data[at]
        at += 1
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, at
        shift += 7
        if shift > 35:
            raise ValueError('Invalid WASM section integer')

records = []
for variant in ['scalar-control', 'simd-ordered']:
    binary = HERE / (variant + '.wasm')
    wat_file = HERE / (variant + '.wat')
    raw = binary.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == build_artifacts[variant]['sha256'], 'Native binary changed after build'
    assert raw[:8] == b'\0asm\1\0\0\0'
    sections = []
    at = 8
    while at < len(raw):
        kind = raw[at]
        length, payload = uleb(raw, at + 1)
        end = payload + length
        assert end <= len(raw)
        sections.append({'kind': kind, 'bytes': length})
        at = end
    subprocess.run([str(DIS), str(binary), '-o', str(wat_file)], check=True, cwd=HERE)
    wat = wat_file.read_text()
    imports = re.findall(r'\(import\s+"([^"]+)"\s+"([^"]+)"', wat)
    writes = re.findall(r'\b(?:i32|i64|f32|f64|v128)\.store\w*|\bmemory\.(?:grow|fill|copy|init)\b|\bdata\.drop\b', wat)
    global_ops = re.findall(r'\bglobal\.(?:get|set)\b', wat)
    proof = {
        'variant': variant, 'sourceSha256': source_sha,
        'file': binary.name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
        'watFile': wat_file.name, 'watSha256': hashlib.sha256(wat_file.read_bytes()).hexdigest(),
        'imports': imports, 'sections': sections,
        'importMemoryOnly': imports == [('env', 'memory')],
        'noStart': not any(s['kind'] == 8 for s in sections),
        'noDataSegments': not any(s['kind'] in [11, 12] for s in sections),
        'noLinearStores': not writes,
        'noLinearStack': not global_ops and not writes,
        'noNewLinearMemory': not any(s['kind'] == 5 for s in sections),
        'squareRootFloat64ThenFloat32': all(token in wat for token in ['f64.sqrt', 'f32.demote_f64', 'f64.promote_f32']),
        'forbiddenWriteInstructions': writes, 'globalOperations': global_ops,
        'meaning': 'Only original copy-tree Memory is imported. All native workspace is locals/operand stack; no writes, start, data, memory growth or globals used. No numerical/performance qualification yet.',
    }
    checks = ['importMemoryOnly', 'noStart', 'noDataSegments', 'noLinearStores', 'noLinearStack', 'noNewLinearMemory', 'squareRootFloat64ThenFloat32']
    proof['status'] = 'passed-imported-memory-no-writes' if all(proof[k] for k in checks) else 'rejected-native-memory-audit'
    (HERE / (variant + '.audit.json')).write_text(json.dumps(proof, indent=2) + '\n')
    records.append(proof)
    if proof['status'] != 'passed-imported-memory-no-writes':
        raise RuntimeError('Private sidecar audit rejected ' + variant)
print(json.dumps({'status': 'passed-imported-memory-no-writes', 'variants': [{k: p[k] for k in ['variant', 'bytes', 'sha256']} for p in records]}))

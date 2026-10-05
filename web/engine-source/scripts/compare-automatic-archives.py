#!/usr/bin/env python3
"""Compare automatic scientific NPZ archives without loading their tensors.

Usage: python3 scripts/compare-automatic-archives.py BASELINE CANDIDATE --output REPORT
       python3 scripts/compare-automatic-archives.py --self-test

Standard library only. Every NPY member, including every root_results_* member,
requires the same dtype, shape, order and exact payload bits. ZIP ordering,
compression, timestamps and NPY header whitespace are container details.
The two scalar JSON members are decoded individually (64 MiB maximum each).
JSON objects are unordered; lists, numeric types, signed zero and every scientific
value are strict. NaN/Infinity tokens are supported as emitted by this exporter.

Exclusions below are exact JSON paths, never a recursive 'provenance'/'time' key
filter. They cover scheduling, heaps, caches, timings and ephemeral session IDs.
Source/model hashes, decoder/algorithm versions, recipes, matrices, NCC scores,
groups, labels and scientific provenance remain strict. The runtime release ID
alone may differ. All preflightExecutions fields remain strict even inside an
excluded metrics object. Each exclusion encountered is recorded in the report.
No exclusion may conceal a reference to an NPY array.

Exit status: 0 = equivalent scientific data; 1 = difference; 2 = invalid/input IO.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
import tempfile
import unittest
import zipfile

JSON_MEMBERS = {'metadata_json.npy', 'browser_provenance_json.npy'}
MISSING = object()
DEFAULT_CHUNK = 1024 * 1024
MAX_JSON_BYTES = 64 * 1024 * 1024
MAX_HEADER_BYTES = 1024 * 1024

# '*' matches one path component only. Unknown fields are compared, not dropped.
RULES = []
def rules(document, parent, fields, reason):
    RULES.extend((document, tuple((parent + '/' + field).strip('/').split('/')), reason)
                 for field in fields)

rules('metadata_json.npy', '/results/sift/preprocessing/ocr',
      ['workers', 'peakWorkerHeapBytes', 'taskExecutions', 'retries', 'totalMs'],
      'OCR execution resources and elapsed time')
rules('metadata_json.npy', '/results/sift/metadata/extraction',
      ['workers', 'peakWorkerHeapBytes', 'executions', 'retries'],
      'SIFT worker execution resources')
rules('metadata_json.npy', '/results/sift/metadata/matching',
      ['gpuBatches', 'gpuFailure'], 'Matching execution route diagnostics')
rules('metadata_json.npy', '/results/sift/metadata', ['stageCache', 'counts'],
      'Cache hits and execution counts, not feature/match counts')
rules('metadata_json.npy', '/results/d2prl/metadata',
      ['resultId', 'analysisId', 'revision', 'cache_hits'],
      'Ephemeral D2 session identity and cache use')
rules('metadata_json.npy', '/results/d2prl/metadata/zones/*', ['execution'],
      'D2 backend execution, heap/arena and recovery diagnostics')
rules('metadata_json.npy', '/results/patchmatch/browser_details', ['metrics'],
      'PatchMatch scheduling, cache, heap and recovery diagnostics')
rules('metadata_json.npy', '/results/patchmatch/browser_details/dense_fields/*',
      ['heapBytes'], 'Native worker heap capacity')
rules('browser_provenance_json.npy', '/automatic', ['attempts'],
      'Provider execution attempt counts')
rules('browser_provenance_json.npy', '/providers/*', ['metrics'],
      'Provider timing, resource and cache diagnostics')
rules('browser_provenance_json.npy', '/providers/forgeryscope/provenance/providers/*',
      ['sourceSurfaceIdentity'], 'Ephemeral source surface handle; source hash remains strict')
rules('browser_provenance_json.npy', '/providers/d2prl/provenance', ['engine'],
      'Runtime release identifier; model, kernel and decoder provenance remain strict')


def pointer(path):
    return '/' + '/'.join(str(x).replace('~', '~0').replace('/', '~1') for x in path)


def exclusion(document, path):
    for member, pattern, reason in RULES:
        if member == document and len(path) == len(pattern) and all(
                want == '*' or str(got) == want for want, got in zip(pattern, path)):
            return reason
    return None


def exact_json(a, b):
    if type(a) is not type(b):
        return False
    if isinstance(a, float):
        return (math.isnan(a) and math.isnan(b)) or struct.pack('>d', a) == struct.pack('>d', b)
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(exact_json(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(exact_json(x, y) for x, y in zip(a, b))
    return a == b


def short(value):
    if value is MISSING:
        return '<missing>'
    if isinstance(value, dict):
        return {'type': 'object', 'keys': list(value)[:12], 'keyCount': len(value)}
    if isinstance(value, list):
        return {'type': 'array', 'length': len(value)}
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, str) and len(value) > 200:
        return value[:200] + '…'
    return value


def digest_json(value):
    if value is MISSING:
        return None
    text = json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':'))
    return hashlib.sha256(text.encode()).hexdigest()


def require_no_arrays(value):
    if isinstance(value, dict):
        if 'array' in value:
            raise ValueError('An excluded diagnostic subtree contains an array reference')
        for child in value.values():
            require_no_arrays(child)
    elif isinstance(value, list):
        for child in value:
            require_no_arrays(child)


def compare_json(a, b, document, report, path=()):
    reason = exclusion(document, path)
    if reason:
        require_no_arrays(a)
        require_no_arrays(b)
        report['exclusions'].append({'member': document, 'path': pointer(path),
            'reason': reason, 'changed': not exact_json(a, b),
            'baselineSha256': digest_json(a), 'candidateSha256': digest_json(b)})
        return
    if type(a) is not type(b):
        difference(report, document, 'JSON type or missing field', path=pointer(path),
                   baseline=short(a), candidate=short(b))
    elif isinstance(a, dict):
        for key in sorted(a.keys() | b.keys()):
            compare_json(a.get(key, MISSING), b.get(key, MISSING), document, report, path + (key,))
    elif isinstance(a, list):
        if len(a) != len(b):
            difference(report, document, 'JSON list length', path=pointer(path),
                       baseline=len(a), candidate=len(b))
        for index, (x, y) in enumerate(zip(a, b)):
            compare_json(x, y, document, report, path + (index,))
    elif not exact_json(a, b):
        difference(report, document, 'JSON value', path=pointer(path),
                   baseline=short(a), candidate=short(b))


def preflight_fields(value, path=(), found=None):
    found = {} if found is None else found
    if isinstance(value, dict):
        for key, child in value.items():
            if key == 'preflightExecutions':
                found[pointer(path + (key,))] = child
            preflight_fields(child, path + (key,), found)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            preflight_fields(child, path + (index,), found)
    return found


def validate_references(value, names):
    if isinstance(value, dict):
        if 'array' in value:
            ref = value['array']
            if not isinstance(ref, str) or ref + '.npy' not in names:
                raise ValueError(f'Missing or invalid array reference: {ref!r}')
        for child in value.values():
            validate_references(child, names)
    elif isinstance(value, list):
        for child in value:
            validate_references(child, names)


def difference(report, member, kind, **details):
    report['differenceCount'] += 1
    if len(report['differences']) < report['maxDifferences']:
        report['differences'].append({'member': member, 'kind': kind, **details})


def read_exact(stream, count):
    data = stream.read(count)
    if len(data) != count:
        raise ValueError('Truncated NPY member')
    return data


def read_header(stream, file_size):
    prefix = read_exact(stream, 8)
    if prefix[:6] != b'\x93NUMPY' or prefix[6:] not in (b'\x01\x00', b'\x02\x00', b'\x03\x00'):
        raise ValueError('Invalid or unsupported NPY signature/version')
    width = 2 if prefix[6] == 1 else 4
    length = int.from_bytes(read_exact(stream, width), 'little')
    if length > MAX_HEADER_BYTES:
        raise ValueError('NPY header exceeds safety bound')
    header = ast.literal_eval(read_exact(stream, length).decode('utf-8' if prefix[6] == 3 else 'latin1'))
    if not isinstance(header, dict) or set(header) != {'descr', 'fortran_order', 'shape'}:
        raise ValueError('Unsupported NPY header fields')
    descr, shape = header['descr'], header['shape']
    if (not isinstance(descr, str) or not re.fullmatch(r'[<>=|][biufcSUV][0-9]+', descr)
            or type(header['fortran_order']) is not bool or not isinstance(shape, tuple)
            or any(type(n) is not int or n < 0 for n in shape)):
        raise ValueError('Unsupported NPY dtype/shape; object arrays are never unpickled')
    itemsize = int(descr[2:]) * (4 if descr[1] == 'U' else 1)
    expected = math.prod(shape) * itemsize
    if expected != file_size - 8 - width - length:
        raise ValueError('NPY payload size does not match dtype and shape')
    return header, expected


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON object key: {key!r}')
        result[key] = value
    return result


def read_json(stream, header, size):
    if size > MAX_JSON_BYTES:
        raise ValueError('JSON member exceeds 64 MiB bound')
    if header['shape'] != () or not re.fullmatch(r'[<>]U[0-9]+', header['descr']):
        raise ValueError('Expected scalar Unicode NPY for JSON')
    raw = read_exact(stream, size)
    # Reach EOF to validate ZIP CRC even for an empty payload.
    if stream.read(1):
        raise ValueError('Trailing NPY bytes')
    return json.loads(raw.decode('utf-32-le' if header['descr'][0] == '<' else 'utf-32-be'),
                      object_pairs_hook=unique_object)


def members(archive):
    result = {}
    for entry in archive.infolist():
        if entry.filename in result:
            raise ValueError(f'Duplicate ZIP member: {entry.filename}')
        if entry.is_dir() or not entry.filename.endswith('.npy'):
            raise ValueError(f'Unexpected archive member: {entry.filename}')
        result[entry.filename] = entry
    if not JSON_MEMBERS <= result.keys() or not any(n.startswith('root_results_') for n in result):
        raise ValueError('Archive lacks automatic metadata or root_results arrays')
    return result


def compare_archives(baseline, candidate, chunk_bytes=DEFAULT_CHUNK, max_differences=100):
    if not 4096 <= chunk_bytes <= 16 * 1024 * 1024:
        raise ValueError('Chunk size must be between 4 KiB and 16 MiB')
    report = {'format': 'automatic-archive-bitwise-comparison-v1',
        'baseline': str(Path(baseline).resolve()), 'candidate': str(Path(candidate).resolve()),
        'chunkBytes': chunk_bytes, 'maxJsonMemberBytes': MAX_JSON_BYTES,
        'maxDifferences': max_differences, 'differenceCount': 0, 'differences': [],
        'exclusions': [], 'arrays': [], 'jsonMembers': [], 'payloadBytesCompared': 0,
        'notes': ['All NPY payloads outside the two JSON members are compared bit-for-bit.',
                  'No float tolerance, array reordering, sorting of groups or model matching.',
                  'ZIP metadata and NPY header formatting are ignored.',
                  'JSON objects ignore key order; array order and numeric types/bits remain strict.',
                  'Exclusions are named runtime paths only; source/model hashes remain strict.',
                  'JSON documents are bounded and read one member pair at a time; tensors stream.']}
    with zipfile.ZipFile(baseline) as left, zipfile.ZipFile(candidate) as right:
        lm, rm = members(left), members(right)
        for name in sorted(lm.keys() ^ rm.keys()):
            difference(report, name, 'Member missing', baseline=name in lm, candidate=name in rm)
        for name in sorted(lm.keys() & rm.keys()):
            with left.open(lm[name]) as ls, right.open(rm[name]) as rs:
                lh, ln = read_header(ls, lm[name].file_size)
                rh, rn = read_header(rs, rm[name].file_size)
                if name in JSON_MEMBERS:
                    a, b = read_json(ls, lh, ln), read_json(rs, rh, rn)
                    validate_references(a, lm)
                    validate_references(b, rm)
                    before = report['differenceCount']
                    compare_json(preflight_fields(a), preflight_fields(b), name + ':preflight', report)
                    compare_json(a, b, name, report)
                    report['jsonMembers'].append({'member': name, 'baselineBytes': ln,
                        'candidateBytes': rn, 'scientificDifferenceCount': report['differenceCount'] - before})
                    del a, b
                    continue
                if lh != rh:
                    difference(report, name, 'NPY dtype/shape/order', baseline=lh, candidate=rh)
                lhash, rhash, offset, first = hashlib.sha256(), hashlib.sha256(), 0, None
                while True:
                    lb, rb = ls.read(chunk_bytes), rs.read(chunk_bytes)
                    if not lb and not rb:
                        break
                    lhash.update(lb)
                    rhash.update(rb)
                    if lb != rb and first is None:
                        limit = min(len(lb), len(rb))
                        first = offset + next((i for i in range(limit) if lb[i] != rb[i]), limit)
                    offset += max(len(lb), len(rb))
                if first is not None:
                    difference(report, name, 'NPY payload bits', firstPayloadByte=first)
                report['payloadBytesCompared'] += max(ln, rn)
                report['arrays'].append({'member': name, 'dtype': lh['descr'], 'shape': lh['shape'],
                    'bytes': ln, 'baselineSha256': lhash.hexdigest(), 'candidateSha256': rhash.hexdigest(),
                    'equal': lh == rh and first is None})
    report['scientificallyEqual'] = report['differenceCount'] == 0
    report['arrayCount'] = len(report['arrays'])
    report['rootResultsArrayCount'] = sum(a['member'].startswith('root_results_') for a in report['arrays'])
    report['changedExclusionCount'] = sum(e['changed'] for e in report['exclusions'])
    return report


def self_test():
    class ComparatorTests(unittest.TestCase):
        def setUp(self):
            self.temp = tempfile.TemporaryDirectory()
            self.addCleanup(self.temp.cleanup)
            self.folder = Path(self.temp.name)

        def archive(self, name, *, bitflip=False, score=.875, elapsed=1, reverse=False,
                    missing=False, dtype='<f4', preflight=0, model_hash='model-sha', duplicate=False):
            meta = {'results': {'patchmatch': {'models': [{'NCC': score, 'matrix': [1, 0, 0, 1]}],
                    'browser_details': {'metrics': {'elapsedMs': elapsed, 'preflightExecutions': preflight}}}},
                    'plane': {'array': 'root_results_patchmatch_scores'}}
            prov = {'providers': {'d2prl': {'provenance': {'model': {'sha256': model_hash}}}}}
            def npy(descr, shape, raw):
                h = repr({'descr': descr, 'fortran_order': False, 'shape': shape}).encode('latin1') + b'\n'
                return b'\x93NUMPY\x01\x00' + struct.pack('<H', len(h)) + h + raw
            data = bytearray(struct.pack('<ffff', 0, -0., .875, 1.)) * 2050  # multiple 4 KiB chunks
            if bitflip:
                data[12288] ^= 1
            entries = [('root_results_patchmatch_scores.npy', npy(dtype, (len(data)//4,), data)),
                       ('root_biomes_mask.npy', npy('|u1', (3,), b'\x00\x01\xff'))]
            for member, value in [('metadata_json.npy', meta), ('browser_provenance_json.npy', prov)]:
                text = json.dumps(value, sort_keys=reverse)
                entries.append((member, npy('<U' + str(len(text)), (), text.encode('utf-32-le'))))
            path = self.folder / name
            with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED if reverse else zipfile.ZIP_STORED) as z:
                for member, data in reversed(entries) if reverse else entries:
                    if not (missing and member == 'root_biomes_mask.npy'):
                        z.writestr(member, data)
                if duplicate:
                    import warnings
                    with warnings.catch_warnings():
                        warnings.simplefilter('ignore')
                        z.writestr(entries[0][0], entries[0][1])
            return path

        def compare(self, **kwargs):
            return compare_archives(self.archive('a.npz'), self.archive('b.npz', **kwargs), 4096)

        def test_container_order_and_diagnostic_changes(self):
            r = self.compare(reverse=True, elapsed=9)
            self.assertTrue(r['scientificallyEqual'])
            self.assertEqual(r['arrayCount'], 2)
            self.assertEqual(r['changedExclusionCount'], 1)

        def test_late_chunk_bit_change(self):
            r = self.compare(bitflip=True)
            self.assertFalse(r['scientificallyEqual'])
            self.assertEqual(r['differences'][0]['firstPayloadByte'], 12288)

        def test_ncc_and_signed_zero_strict(self):
            self.assertFalse(self.compare(score=.8749999999999999)['scientificallyEqual'])
            self.assertFalse(exact_json(-0., 0.))
            self.assertFalse(exact_json(1, 1.))
            self.assertTrue(exact_json(float('nan'), float('nan')))

        def test_model_hash_strict(self):
            self.assertFalse(self.compare(model_hash='changed')['scientificallyEqual'])

        def test_dtype_strict(self):
            self.assertFalse(self.compare(dtype='<u4')['scientificallyEqual'])

        def test_non_root_results_member_strict(self):
            self.assertFalse(self.compare(missing=True)['scientificallyEqual'])

        def test_preflight_not_hidden_by_metrics(self):
            self.assertFalse(self.compare(preflight=1)['scientificallyEqual'])

        def test_duplicate_member_invalid(self):
            with self.assertRaisesRegex(ValueError, 'Duplicate ZIP member'):
                self.compare(duplicate=True)

        def test_duplicate_json_and_array_refs_cannot_hide(self):
            with self.assertRaisesRegex(ValueError, 'Duplicate JSON'):
                json.loads('{"a":1,"a":2}', object_pairs_hook=unique_object)
            with self.assertRaisesRegex(ValueError, 'array reference'):
                require_no_arrays({'arbitrary': [{'array': 'secret'}]})

        def test_exclusions_are_not_recursive_key_filters(self):
            report = {'differenceCount': 0, 'differences': [], 'maxDifferences': 10, 'exclusions': []}
            compare_json({'biomes': [{'provenance': {'score': 1}}]},
                         {'biomes': [{'provenance': {'score': 2}}]}, 'metadata_json.npy', report)
            self.assertEqual(report['differenceCount'], 1)

    return unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ComparatorTests)).wasSuccessful()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('baseline', nargs='?')
    parser.add_argument('candidate', nargs='?')
    parser.add_argument('--output', type=Path, help='Write complete JSON report (per-array hashes, exclusions and differences)')
    parser.add_argument('--chunk-bytes', type=int, default=DEFAULT_CHUNK)
    parser.add_argument('--max-differences', type=int, default=100, help='Bound detailed differences, never comparisons/counts')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        return 0 if self_test() else 1
    if not args.baseline or not args.candidate:
        parser.error('BASELINE and CANDIDATE are required unless --self-test is used')
    if args.max_differences < 1:
        parser.error('--max-differences must be positive')
    if args.output and args.output.resolve() in (Path(args.baseline).resolve(), Path(args.candidate).resolve()):
        parser.error('Report must not overwrite an input archive')
    try:
        report = compare_archives(args.baseline, args.candidate, args.chunk_bytes, args.max_differences)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
        summary = {k: report[k] for k in ['scientificallyEqual', 'arrayCount', 'rootResultsArrayCount',
            'payloadBytesCompared', 'differenceCount', 'changedExclusionCount']}
        summary['differences'] = report['differences']
        if args.output:
            summary['report'] = str(args.output.resolve())
        print(json.dumps(summary, indent=2, allow_nan=False))
        return 0 if report['scientificallyEqual'] else 1
    except (OSError, ValueError, SyntaxError, UnicodeError, zipfile.BadZipFile, RuntimeError) as error:
        print(json.dumps({'error': type(error).__name__, 'message': str(error)}), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())

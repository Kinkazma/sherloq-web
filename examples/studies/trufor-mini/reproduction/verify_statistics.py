#!/usr/bin/env python3
"""Compare independently recalculated numbers with the recorded study results."""
import argparse
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent


def verify(result, reference, bootstrap):
    fields = 0
    largest = 0.0
    for table in ['image_metrics', 'pixel_primary_metrics', 'pixel_macro', 'timings', 'direct_agreement']:
        def key(row):
            return tuple(row.get(k) for k in ['dataset', 'model', 'score', 'threshold', 'view'])
        actual = {key(row): row for row in result[table]}
        expected = {key(row): row for row in reference[table]}
        if actual.keys() != expected.keys():
            raise AssertionError('Different row identities in '+table)
        for identity, row in expected.items():
            for name, target in row.items():
                if target is None:
                    assert actual[identity].get(name) is None, (table, identity, name)
                elif isinstance(target, (int, float)) and not isinstance(target, bool):
                    value = actual[identity][name]
                    assert math.isclose(value, target, rel_tol=1e-12, abs_tol=1e-12), (table, identity, name, value, target)
                    largest = max(largest, abs(value-target))
                    fields += 1
    interval_values = 0
    if 'bootstrap' in result:
        actual = result['bootstrap']['ALL']['intervals']
        expected = bootstrap['ALL']['intervals']
        assert actual.keys() == expected.keys()
        for name, target in expected.items():
            for field in ['low', 'high', 'finite_replicates']:
                assert math.isclose(actual[name][field], target[field], rel_tol=1e-12, abs_tol=1e-12), (name, field)
                largest = max(largest, abs(actual[name][field]-target[field]))
                interval_values += 1
    return dict(status='passed', numerical_point_fields=fields, interval_values=interval_values,
                maximum_absolute_difference=largest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, default=HERE/'reproduced-results.json')
    args = parser.parse_args()
    result = verify(json.loads(args.result.read_text()),
                    json.loads((HERE/'reference-results.json').read_text()),
                    json.loads((HERE/'reference-bootstrap.json').read_text()))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()

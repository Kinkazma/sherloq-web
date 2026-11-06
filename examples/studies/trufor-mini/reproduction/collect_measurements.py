#!/usr/bin/env python3
"""Convert fresh paired-inference JSONL to the compact analysis CSV.

Only source-group/development/deduplication metadata are reused from the
reference CSV. All scores, counts, map differences and timings come from the
new inference records. By default all study cases must be present.
"""
import argparse
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
METADATA = ['id', 'dataset', 'is_tampered', 'bootstrap_component_sha256',
            'previously_examined', 'unique_source_first']
MODELS = ['trufor_original', 'proxy_current']


def collect(records, reference, allow_partial=False):
    original = {row['id']: row for row in reference}
    fresh = {}
    for record in records:
        identity = record['id']
        if identity in fresh or identity not in original or record.get('status') != 'ok':
            raise ValueError('Unknown, duplicated or failed case: '+identity)
        fresh[identity] = record
    if not allow_partial and fresh.keys() != original.keys():
        raise ValueError('The full study is incomplete; use --allow-partial only for a declared subset')
    output = []
    for source in reference:
        if source['id'] not in fresh:
            continue
        record = fresh[source['id']]
        assert record['dataset'] == source['dataset']
        assert int(bool(record['is_tampered'])) == int(source['is_tampered'])
        row = {key: source[key] for key in METADATA}
        scores = record['image_scores']
        row.update(score_trufor_common=scores[MODELS[0]]['mean_top_1_percent_localization'],
                   score_mini_common=scores[MODELS[1]]['mean_top_1_percent_localization'],
                   score_trufor_official=scores[MODELS[0]]['official_global_score'],
                   seconds_trufor=record['inference_seconds'][MODELS[0]],
                   seconds_mini=record['inference_seconds'][MODELS[1]])
        primary = [record.get('pixel_metrics', {}).get(model, {}).get('primary') for model in MODELS]
        row.update(positive_pixels='', negative_pixels='')
        for model in ['trufor', 'mini']:
            for threshold in ['05', '075']:
                row['tp_'+model+'_'+threshold] = ''
                row['fp_'+model+'_'+threshold] = ''
        if all(primary):
            p = primary[0]['0.5']
            row['positive_pixels'] = p['TP']+p['FN']
            row['negative_pixels'] = p['TN']+p['FP']
            for model, values in zip(['trufor', 'mini'], primary):
                for threshold, tag in [('0.5', '05'), ('0.75', '075')]:
                    row['tp_'+model+'_'+tag] = values[threshold]['TP']
                    row['fp_'+model+'_'+tag] = values[threshold]['FP']
        agreement = record['direct_agreement']
        row.update(native_pixels=record['shape'][0]*record['shape'][1],
                   map_mae=agreement['MAE'], map_rmse=agreement['RMSE'])
        for threshold, tag in [('0.5', '05'), ('0.75', '075')]:
            for metric in ['tp', 'fp', 'fn']:
                row['agreement_'+metric+'_'+tag] = agreement['thresholds'][threshold][metric.upper()]
        output.append(row)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', type=Path, required=True, help='results.jsonl from run_pair.py')
    parser.add_argument('--reference', type=Path, default=HERE/'measurements.csv')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--allow-partial', action='store_true')
    args = parser.parse_args()
    with args.reference.open(newline='') as stream:
        reader = csv.DictReader(stream)
        columns = reader.fieldnames
        reference = list(reader)
    with args.results.open() as stream:
        records = [json.loads(line) for line in stream if line.strip()]
    rows = collect(records, reference, args.allow_partial)
    if not rows:
        raise ValueError('No successful cases')
    with args.output.open('x', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({'rows': len(rows), 'full_study': len(rows) == len(reference),
                      'reused_reference_fields': METADATA}))


if __name__ == '__main__':
    main()

# Scientific reproduction: TruFor and TruFor Mini

This directory contains the executable method, its frozen reconstruction recipe, the evaluated case manifest and the individual measurements used in the study. The manuscript and its figures are one level above it. No image collection or large neural checkpoint is duplicated here.

## Recompute the reported statistics

Python 3.11 and NumPy 1.26.4 suffice for this part. From this directory:

```bash
python reproduce_statistics.py --replicates 2000 --output reproduced-results.json
python verify_statistics.py --result reproduced-results.json
```

`measurements.csv` contains the 6,246 recorded entries, including scores, confusion counts, map differences, timing and opaque source-group components. The script recalculates the main tables for each collection and sensitivity subset, plus the 39 full-corpus bootstrap interval series. The verifier compares 4,516 numerical point fields and 117 interval values with `reference-results.json` and `reference-bootstrap.json`. These checks were repeated with zero observed difference. Omit `--replicates 2000` for point estimates alone.

`reference-bootstrap.json` also retains collection-specific intervals. The compact CSV does not contain every pixel-ranking histogram or the spatial boundary analysis; those require a fresh run retaining histograms or maps. The statistics above reproduce recorded measurements, independently of neural inference.

## Reconstruct the exact Mini model

Use the dependencies pinned in `requirements.txt` for source execution. Obtain the original TruFor weights from the [authors’ project](https://github.com/grip-unina/TruFor), then provide their local filename explicitly. The original tensor state must have this canonical SHA256:

```text
30591984b1fbc4caaaf4a0c889b4611cc16765fb0daa0171cba2ad411ad07e0c
```

```bash
python rebuild_mini.py --original-weights original-trufor.pt --output work/mini-rebuilt.pt
```

The original study file SHA256 is recorded in `model-specification.json`. A differently serialized file is accepted only if its named tensor content has the same canonical fingerprint.

The reconstruction recipe in `reconstruction/mini-spec.json` copies or casts 769 tensors from original TruFor and restores 56 frozen derived tensors from `derived-tensors.npz`. Every one of the 825 reconstructed tensors was checked for exact equality with the Mini checkpoint used in the study. Derived tensors are supplied directly to avoid variation in their matrix calculations across libraries. The rebuilt tensor-state SHA256 is:

```text
07fbb94c9738f65bfb7c6e8335638ed892fad329c343d5b8aac0908a982d43fe
```

This identity is independent of `torch.save` container metadata. The architecture and channel selection are frozen; reconstruction performs no fitting, calibration or inference.

## Run both detectors on the evaluated corpus

Obtain the image collections from their authors. `cases.json` lists the exact 6,246 source images and annotations by corpus-relative filename, SHA256, native dimensions, label and mask convention. Place them under a data directory matching those relative paths. The script verifies their bytes before inference.

Start with a small explicit limit; omit `--limit` to evaluate the entire manifest:

```bash
python run_pair.py \
  --original-weights original-trufor.pt \
  --mini-weights work/mini-rebuilt.pt \
  --data-root path/to/corpora \
  --manifest cases.json \
  --output work/new-run \
  --threads 1 --limit 2
```

`run_pair.py` runs the full original model and Mini in CPU FP32, original first, and writes scores, exact counts and per-model durations to `results.jsonl`. It requires a new output directory. `--save-histograms` retains class histograms for pixel ranking; `--save-maps` retains both native maps and annotations as well. No existing output or source image is removed.

The paired benchmark decodes the native encoded RGB grid with Pillow, **without EXIF transposition**, divides by 256 and performs no resizing or recompression. The original learned detector is reported separately from the top-1% score shared by both networks. Mask rules, thresholds, attention policies, model identities and timing definitions appear in `model-specification.json`, `measures.py` and `reconstruction/mini-spec.json`.

To analyze a complete fresh run with the same statistical code:

```bash
python collect_measurements.py --results work/new-run/results.jsonl --output work/fresh-measurements.csv
python reproduce_statistics.py --input work/fresh-measurements.csv --replicates 2000 --output work/fresh-results.json
```

The collector reuses only IDs, grouping and development/deduplication flags from the reference CSV. Every score, count, map difference and duration comes from the fresh inference records. It rejects an incomplete study unless `--allow-partial` is supplied explicitly. Use the verifier against the supplied reference only for recalculations of the supplied measurements, rather than expecting new timings to equal old ones.

## Channel 333

The manuscript gives the extraction point and fixed readout. `extract_channel333.py` implements it, using the same original tensor identity:

```bash
python extract_channel333.py \
  --src trufor_src --config trufor_src/trufor.yaml \
  --weights original-trufor.pt --image example.jpg \
  --output work/channel333.npz --device cpu
```

For these illustrative outputs, EXIF orientation is applied as stated in the manuscript; this convention is distinct from the encoded-grid benchmark. The hook captures post-ReLU localization-fusion channel 333, joins row bands if necessary, interpolates before sigmoid and preserves the raw activation separately from its readout. The three illustration originals are not redistributed in this package.

## Reading the implementation

- `compact.py`, `trufor_src/`: model architecture, exact/approximated attention and eight-unit readout.
- `reconstruction/`: frozen configuration, retained-channel selection and tensor reconstruction.
- `measures.py`: annotations, thresholds, image aggregation and map agreement.
- `reproduce_statistics.py`: confusion metrics, ranking, micro/macro weighting and paired grouped bootstrap.
- `validation.json`: reconstruction, statistical and functional checks performed for this package.

The portable launcher's default sequential run is a reproducibility interface, not a recreation of the original concurrent timing schedule. New runtimes depend on the selected execution conditions; small FP32 differences between libraries can also affect values close to a decision threshold. The recorded times and the scope of their interpretation remain those described in the manuscript.

## Credits and licences

TruFor is by F. Guillaro, D. Cozzolino, A. Sud, N. Dufour and L. Verdoliva, CVPR 2023. Original TruFor and CMX notices are retained in `licenses/`; the corresponding source files retain their authors’ notices. The compact implementation and reproduction scripts expose the adaptation evaluated in this study. Nothing in this package changes the original software licences.

# Rebuilding the frozen TruFor Mini model

This directory contains the small scientific source subset needed to reconstruct
the evaluated TruFor Mini tensor state and export the browser operators. It
contains no image corpus, recorded measurements or large model checkpoint.

TruFor Mini is a structural reduction of [TruFor](https://github.com/grip-unina/TruFor),
by Fabrizio Guillaro, Davide Cozzolino, Avneesh Sud, Nicholas Dufour and Luisa
Verdoliva, CVPR 2023. The original TruFor and CMX notices and licenses are retained
under `licenses/`. The original TruFor terms, including their informational and
nonprofit-use restriction, continue to apply; this directory does not replace
them with a different model license.

## Reconstruction

Run these commands from the SHERLOQ source root. Obtain the original TruFor
checkpoint separately from its authors and pass its file path explicitly.

```sh
python3 -m venv .venv-mini-export
. .venv-mini-export/bin/activate
python -m pip install -r web/engine-source/scripts/trufor-mini-reproduction/requirements.txt
mkdir -p work/trufor-mini
python web/engine-source/scripts/trufor-mini-reproduction/rebuild_mini.py \
  --original-weights PATH_TO_ORIGINAL_TRUFOR.pt \
  --output work/trufor-mini/mini-rebuilt.pt
```

The reconstruction verifies the original tensor state, the derived-tensor archive
and all 825 reconstructed Mini tensors. It uses exact copies and explicit dtype
casts plus 56 frozen derived tensors; it performs no fitting, factorization or
image inference. It refuses to overwrite an existing output checkpoint.

Canonical tensor-state SHA-256 values:

| State | SHA-256 |
|---|---|
| Original TruFor | `30591984b1fbc4caaaf4a0c889b4611cc16765fb0daa0171cba2ad411ad07e0c` |
| TruFor Mini | `07fbb94c9738f65bfb7c6e8335638ed892fad329c343d5b8aac0908a982d43fe` |

The fingerprint hashes sorted tensor names, dtypes, shapes and raw contiguous CPU
bytes. A newly serialized checkpoint can have a different file SHA-256 while
retaining the exact verified tensor state.

## Browser operator export

```sh
python web/engine-source/scripts/export-trufor-mini.py \
  --checkpoint work/trufor-mini/mini-rebuilt.pt \
  --reproduction web/engine-source/scripts/trufor-mini-reproduction \
  --engine web/engine-source \
  --output work/trufor-mini/operators
```

The exporter checks the Mini tensor-state identity, configuration and retained
channel selection before exporting and validating the ONNX graphs. Its manifest
records each graph's size and SHA-256. The supplied requirements record the
versions used for source execution and ONNX export; they are build dependencies,
not dependencies installed in the user's browser.

The export then composes existing operators with
`compose-mini-message-mlp.py`, `compose-mini-query-mlp.py` and
`compose-mini-fusion.py`, supplied beside the exporter. These structural ONNX
compositions verify unchanged operator attributes and initializer payloads.
They preserve the complete RGB key/value populations and fusion contexts.
The original RGB query, MLP and split-value operators remain available for the
bounded-query fallback; the original fusion operators remain available for
catalogues that do not select the joined fusion graph.

The browser path preserves the frozen model's native input grid and RGB/256
scaling, folded and pruned Noiseprint++ convolutions, full RGB attention,
`pool2, pool2, global, global` noise-query policy and projected eight-channel
localization readout. Interpolation is applied to logits before sigmoid. There
is no original confidence head or learned official image classifier in Mini.
Any top-1% map summary is explicitly a score derived from localization.

By default, operator export creates no image or reference-output fixtures and
runs no reference-image inference. To produce reference outputs from a real
photograph, append `--reference-image PATH_TO_PHOTOGRAPH` to the export command;
the option can be repeated. Use an image of at least 29 × 29 pixels whose native
dimensions fit the build machine's memory. The exporter applies EXIF orientation
and RGB conversion without resizing, records the input file's SHA-256, and writes
the decoded RGB, map, noiseprint and feature tensors under `mini-reference/`
beside the operator directory. These explicitly requested outputs are
operator-validation material, separate from corpus benchmarks. No random image
is generated. Shape-tracing tensors used to export operators are not retained
as image cases.

Checkpoint reconstruction and operator export are separate from the browser
resource catalogue, worker and offline-shell reconstruction. The public
`web/wordpress/scripts/trufor-mini-resource-plan.py` generates the exact Mini
files/chunks, feature registry and raw/delivered lock fragments. Follow
`web/wordpress/scripts/TRUFOR-MINI-RESOURCE-PLAN.md` for its verified merge
commands, source transport and the subsequent public inventory/build steps.

## Contents

- `rebuild_mini.py`: exact state reconstruction and fingerprint checks.
- `reconstruction/mini-spec.json`: frozen configuration and tensor recipes.
- `reconstruction/derived-tensors.npz`: compact archive of derived coefficients.
- `compact.py` and `trufor_src/`: model definitions used by the exporter.
- `licenses/`: unchanged upstream TruFor and CMX licenses.

Keep the image corpora, inference outputs, operational logs and any temporary
rebuilt checkpoint outside this source directory. They are not needed to
review or redistribute these reconstruction sources.

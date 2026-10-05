# M3 global learned attention with bounded working pages

The external resources `xfeat-glue-paged`, `aliked-glue-paged` and
`sift-glue-paged` are alternatives to their existing `*-glue` ONNX resources.
Supply them through `loadM3Models({models:{...}})`, using the exported
`SPARSE_GLUE_PAGED_MODELS` identity and an explicit URL or bytes. When both are
supplied, the paged resource is used. The old graphs remain available as the
CPU reference. Model weights are external and never included in this repository.
Build the bundles with `scripts/export-sparse-glue-paged.py --kind=...` against
the same pinned native weights. This is an offline development operation.

Every native learned layer is retained: input projection, positional encoding,
self attention over all keys, spatial cross attention, feed-forward updates,
and the final dual-softmax/matchability assignment. The candidate graph remains
the native spatial graph in cKDTree order. CSR row pages contain **all candidates
of each query**. Neither maxima nor denominators are estimated from a local
subset. The reverse direction retains original edge order within each target.

ONNX runs the native learned projections and feed-forward layers. CPU WASM or
WebGPU executes the complete cross-attention rows, normally 128 queries and at
most 1,048,576 edges per page; a longer single query remains complete. Final
assignment uses 65,536-edge dot-product pages and global row statistics in both
directions. Global edges, CSR indices and confidence values are admitted against
the shared budget. No BigInt64 copy of every edge is required by this protocol.
An allocation failure is reported rather than silently reducing the graph.
The result sorting excludes confidences below the native cutoff only **after**
attention: those entries cannot affect a later accepted greedy match. Ties and
mutual-choice rules are preserved, including native seen flags.

Worker admission includes a 512 MiB initial ORT heap and a separate 512 MiB
allowance covering attention WASM (hard maximum128 MiB), GPU buffers and staging.
ORT admission can grow after an actual useful allocation failure. Under `auto`,
a useful GPU failure retries on CPU; explicit `webgpu` reports the failure.
Cancellation terminates the worker and destroys its private GPU device. Metadata
reports provider, page counts, largest actual page, heap capacities and useful
failures; `preflightExecutions` remains zero. Cache identities include the bundle
hash. Coordinates, groups, NPZ/JSON fields, rendered windows and exports are the
existing sparse CM2 contracts.

## Numerical evidence and actual large calculations

On Chrome154/ARM64, the three synthetic/native confidence cases per family retain
all final selection decisions. Maximum absolute GPU confidence errors are
5.73814e-4 (XFeat),6.85453e-5 (SIFT),1.52290e-4 (ALIKED). CPU XFeat reaches
4.87566e-5. These are measured arithmetic differences, not bit-exact claims or a
universal error bound. The authorized1e-3 latitude is used for learned confidence;
the preferred1e-5 is not attained by every case. Native smaller complete pipelines
preserve pair IDs, groups, provenance and every rendered byte for XFeat, SIFT,
ALIKED and ALIKED rotation. XFeat complete-pipeline pair-score maximum is
8.87871e-4 GPU/4.67300e-5 CPU. SIFT is3.58820e-5 GPU/4.11273e-6 CPU;
ALIKED variants are at most6.67572e-6 GPU/1.78814e-7 CPU. Existing extraction
coordinate/score differences remain documented in the preceding extraction proofs.

Actual12000×8000 rich copied-noise browser calculations, two workers,6 GiB budget:

| Method | Global edges | Retained points / pairs / groups | Total time | Peak accounted bytes |
|---|---:|---:|---:|---:|
| XFeat + LighterGlue | 35,992,512 | 6000 / 23 / 1 | 65.266s | 4,797,999,968 |
| SIFT + LightGlue | 35,993,944 | 6000 / 1714 / 1 | 221.307s | 4,968,228,218 |

XFeat uses native threshold0.7 (confidence cutoff0.3); the earlier0.1 threshold
(cutoff0.9) finished with no accepted pair and is not the positive qualification.
The native model's maximum confidence on this input was0.647922. All candidate
edges remained present. SIFT uses threshold0.3. Attention itself took27.439s and
69.689s respectively. Times are observations under shared machine load, not a
controlled speed benchmark. The preceding monolithic XFeat run refused6 GiB
admission, then returned invalid confidence at8 GiB; it was not a successful
qualification. This supplies the concrete memory/functionality gain for the
numerical tradeoff.

Both positive runs include original-coordinate windows, cached alternate views,
complete NPZ and PNG, checksum validation and zero remaining memory on release.
Their PNGs match native drawing of the exported arrays on all288,000,000 bytes.
This comparison does not claim a second96 MP native neural inference. The native
confidence and final-decision comparisons use the smaller documented corpora.

Proofs: `m3-*-sparse-glue-paged-*-proof.json`,
`m3-glue-attention-paged*-pipeline-proof.json`,
`m3-sparse-96mp-{xfeat-lighterglue,sift-lightglue}-webgpu-proof.json`,
`m3-96mp-sparse-export-{xfeat-lighterglue,sift-lightglue}-proof.json`.
The lifecycle proof injects a failure only after a useful learned layer: automatic
CPU retry returns all80 native positive matches, and cancellation during attention
leaves no retained/cache/active reservations.

Current sparse metadata uses `qualification: native-comparisons-documented`. The
older proof snapshots retain their original provisional labels; their numerical
measurements and decision comparisons remain the evidence. This label does not
claim universal bit equality across platforms.

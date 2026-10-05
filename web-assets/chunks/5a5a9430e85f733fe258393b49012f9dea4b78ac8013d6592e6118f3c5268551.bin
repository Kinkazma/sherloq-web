# CMSeg addnoise: resident global GPU correlation

M1.45 adds a hybrid path for the existing addnoise model. The qualified ONNX
encoder and decoder, checkpoint, native 512×512 input and decision threshold
are unchanged. The largest correlation compares every one of its 16,384
locations with all 16,384 locations, twice. No distant match is dropped.

Only its 24-term dot reduction moves to ordered float32 GPU FMA. Addnoise's
separate multiply/add CPU normalization is preserved; it must not be replaced
by the generalization model's FMA normalization. Gaussian suppression, both
native softmax reduction/division orders and sorted TopK remain CPU. The two
smaller correlations also remain CPU. The existing generalization GPU route
retains its previous implementation in this increment.

## Resources and selection

The complete normalized tensor stays on the GPU across all 64-row jobs and
both passes. Four GPU buffers are allocated once, with at most 9,961,488 bytes
of explicit buffers. Shared admission also reserves staging, CPU row copies,
pipeline allowance and every postprocessing worker's real 32 MiB WASM ceiling.
One GPU job overlaps independent, single-thread CPU jobs. No quadratic matrix
is stored, no nested worker pool is created, and no startup calibration runs.

`loadSegmentationModel` accepts the same pinned CPU bundle and two child ONNX
files. Its new `gpu.sharedAssets` descriptor uses that URL without conversion
or a second model mirror. `auto` considers GPU capabilities and available
memory; explicit CPU is retained. A GPU route is not a universal speed claim.
Both ONNX sessions stay warm when their shared reservation fits, and can be
reclaimed under pressure. The normalized GPU tensor is retained only during
one correlation, not across model inputs.

`execution.correlationBackend` reports `webgpu-resident-dot-128-wasm-rest`;
CPU reports `wasm-cpu`. `correlationGpuMs` includes initialization, transfers,
readback and CPU postprocessing of the largest correlation. `correlationMs`
covers all three correlations. Session reuse, buffers and timings reach result
and NPZ provenance. Cached views perform no new neural work.

## Numerical and component evidence

The [three complete operator geometries](cmseg-addnoise-correlation-gpu-resident-r64-32m-m1-45-proof.json)
retain all GPU output hashes of the earlier streamed and resident prototypes.
Largest native correlation error is max 2.65208655e-8, mean 1.02609481e-12.
These small intermediate errors do not by themselves qualify network decisions.
Cancellation after actual submission, pre-abort, invalid geometry, memory
refusal and one-worker retry under 64 MiB pass with zero final reservations.
A separate constructor-failure test checks GPU-buffer and reservation cleanup.

The [complete four-image network corpus](cmseg-addnoise-candidate-correlation-model-corpus-m1-45-proof.json)
checks prepared RGB, all 262,144 probabilities and native masks. No mask pixel
changes; the positive case retains all 245 foreground pixels. Its probability
error is max 6.00814819e-5, mean 1.03946158e-7. The paired CPU reference has max
6.31213188e-5, mean 1.04264021e-7. CPU and GPU probability bytes differ, even
though these final masks are exact. Tolerance remains 1e-4 for probabilities;
it is never applied to binary decisions. The initial paired candidate corpus
is also retained in `cmseg-addnoise-candidate-correlation-backend-comparison-1g-proof.json`.

## Costs measured separately

The first streamed GPU prototype rewrote the same input for every block:
808,620,032 bytes written, 3,584 GPU allocations, 8.7056 s versus 5.0655 s CPU.
Retaining the input reduces writes to 1,581,056 bytes and allocations to four.
The next observation was 5.3563 s GPU versus 4.8450 s CPU, with identical GPU
hashes. The final operator observation is 3.6879 s versus 3.4881 s CPU.
All three observations are retained; shared-host timing variation is visible.
GPU readback remains 2,147,483,648 bytes and its cost is included. The component
accounted peak falls from 708,698,112 to 475,396,416 bytes. The two smaller
GPU geometries did not justify replacing their CPU paths.

Actual repeated complete inference uses the same positive input, original
models and budget in both conditions. Each warm run executes the model again;
none is a result-cache hit.

| Budget / backend | Cold, s | Warm 1, s | Warm 2, s | Accounted peak, B |
| --- | ---: | ---: | ---: | ---: |
| 1 GiB CPU | 6.0308 | 5.8307 | 5.5217 | 1,059,652,530 |
| 1 GiB hybrid | 5.2865 | 4.7432 | 4.1396 | 1,059,652,530 |
| 2 GiB CPU | 5.0081 | 4.4723 | 4.5136 | 1,356,227,506 |
| 2 GiB hybrid | 5.0180 | 4.4344 | 4.5494 | 1,332,609,970 |

Under 1 GiB, the hybrid admits eight postprocessing workers while CPU admits
six. Observed warm means are 5.6762 versus 4.4414 s, a 21.75% reduction. Under
2 GiB both admit ten workers: no meaningful speed gain is claimed, but the
peak is 23,617,536 bytes lower. The complete-network peak is governed by other
stages too; it must not be confused with the isolated correlation saving.

The reports `correlation-reuse-cmseg-addnoise-{cpu,webgpu}-m1-45-{1g,2g}-proof.json`
record every run. Warm ONNX HTTP reads are zero. A real 6 MiB idle-budget
pressure evicts the hybrid session; the next inference rereads both ONNX files
and retains the same probability hash and native mask. Final reservations are
zero. Fresh browser per condition; OS/driver caches were not flushed. These
shared-workstation measurements do not establish a ranking for other devices.

## Full source and API qualification

The [96 MP browser recipe](neural-segmented-cmseg-addnoise-large-rich-webgpu-m1-45-candidate-proof.json)
loads the actual rich 12000×8000 JPEG, computes two 8000×6400 regions and the
full-image envelope, then changes the selected zones from cached raw grids.
It checks every value of all four full-resolution planes in both views. Masks
have 216,407 then 65,705 native-positive pixels with zero differences. The first
map error is max 3.58819962e-5, mean 6.15303082e-8. This is a new memory path
using the CPU ONNX encoder with GPU addnoise correlation, not reuse of the
generalization backbone proof.

Load 1.7061 s; analysis 37.6664 s including 6.2887 s projection; cached view
3.6585 s; NPZ preparation 13.6455 s. These functional times are not a paired
96 MP speed benchmark. The peak is 2,355,803,954 bytes under a 3 GiB budget;
source and both results use RAM, the export uses OPFS. One session creation
and two reuses are observed. The cached view performs zero inference.

[Independent NumPy readback](neural-segmented-cmseg-addnoise-large-rich-webgpu-m1-45-candidate-npz-proof.json)
checks all four planes, shapes, dtypes, native values, CRC, complete SHA and
provenance of the 672,015,276-byte NPZ, SHA
`7f2fd3590328e5605a79c38585d441c772df1b9db35368af01e1a7ce6e5f25ea`.
All owned reservations are released. Accounting excludes process RSS and
opaque browser/driver residency.

The immutable-runtime API receipt and exact source/model binding are in
`cmseg-addnoise-delivery-binding.json`. Its smaller original-JPEG recipe also
checks cached views, independent export ownership, cancellation after actual
correlation GPU submission and source reload. These engine receipts do not
qualify WordPress cohabitation or untested mobile devices and GPU vendors.

## Reproduction and native reuse

Build with the pinned Emscripten 4.0.15 using
`scripts/build-cmseg-addnoise-gpu-post.py`, then stage with
`scripts/stage-cmseg-addnoise-correlation-gpu.mjs`. The separate
`ADDNOISE-CORRELATION-GPU-POST-PINNED.json` verifies sources and output SHA.
No weights are included in the runtime or source delivery.

Run the resident operator and model corpus scripts with `--delivered` for
the current runtime. `scripts/build-cmseg-addnoise-research-overlays.py`
recreates the earlier research control flow from immutable M1.44. Historical
reports retain their original source identities; a later reproduction is a
new measurement, not a relabeling of those reports.

Holding a normalized feature tensor across native GPU batches could reduce
Mac transfers too. Native libraries, worker scheduling and transfer costs
need their own measurement. No native file was changed and no Mac speedup is
claimed by this browser result.

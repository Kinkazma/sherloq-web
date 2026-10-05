# MPDN hybrid GPU — local M1 increment0.30.0-m1.3

The real MPDN16×16 model now runs through the common worker using WebGPU for
supported nodes and CPU for TopK. Original RGB/Pillow preparation, float32 model,
native256 input, thresholds, independent ROI and source projection are preserved.
The interface contract is in [SEGMENTATION-M1-CONTRACT.md](SEGMENTATION-M1-CONTRACT.md).

## Why the runtime and graph differ

The ORT1.30 `ort.webgpu.min.mjs` entry uses its native WebGPU provider and is not
compatible with the JSEP factory. That attempted pairing removed the GPU provider;
the study rejected it by requiring actual GPU allocations. The shipped hybrid
uses `ort.all.min.mjs` with the matching JSEP WASM/factory instead. The512MiB heap
ceiling is enforced at instantiation, not merely estimated by an outer budget.

The unmodified graph also exceeded storage-binding limits in wide Concats. Its
GPU validation errors and invalid outputs are retained as rejected evidence.
`rewrite-segmentation-concat.py` groups ordered input copies into nodes with no
more than seven inputs plus output. It does not fuse arithmetic, reduce precision,
replace a detector or alter a decision. Eight bindings are requested by capability;
there is no Apple-brand test. All actual GPU buffers have a separate512MiB cap,
reserved globally, and validation errors prevent acceptance of the result.

## Numerical and lifecycle evidence

Three direct model inputs and the common original-PNG/three-ROI recipe match all
native mask pixels. Common raw maximum difference2.1308661e-6; projected-map
maximum2.1010638e-6. Continuous outputs are not bit exact. The qualifying ROI has
561 positive pixels; this finite corpus is not universal detection accuracy.

The common recipe covers three real inferences, zero-inference envelope views,
cache restoration, cancellation while inferring, original-byte preservation,
JSON/raw/NPZ, independent NumPy readback and a new CPU-button analysis. Automatic
selection is checked in the actual common worker. Runtime files must also pass
the staged-manifest-only recipe; fixtures and models remain separate private
development inputs, with synthetic images suitable for publication.

Observed GPU-buffer peak153,543,360bytes; WASM heap84,738,048bytes. The complete
recipe's maximum admission is1,724,452,750bytes under a3GiB shared limit, with
zero reservations/cache/retained data after cleanup. Codec capacity is separately
32MiB. These figures exclude browser process, driver and shader-compiler memory.

## Requested-job measurements

Each row includes three independent native crops and actual inference. Warm jobs
keep the model session but change a source pixel outside all crops, invalidating
the source digest and forcing fresh inference without changing crop values.

| Stage, milliseconds | CPU cold | GPU cold | CPU warm | GPU warm |
|---|---:|---:|---:|---:|
| Source through both NPZ exports |1441.3|1135.4|1029.7|322.4|
| Analysis RPC |1317.4|1022.0|973.8|263.3|
| Model/runtime loading |273.8|657.8|0.0|0.1|
| Inference, three crops |913.3|206.3|865.5|136.2|
| Native preparation |22.8|23.8|13.8|15.1|
| Source projection |89.5|114.0|85.9|103.2|

The measured whole chain is1.27× faster cold and3.19× faster warm; loading and
projection are not faster in this observation. GPU writes/readbacks are
26,256,832/2,359,296bytes cold and2,614,368/2,359,296bytes warm. The report separates
acquisition, decode, RPC, output copies, a headless mask Canvas presentation,
raw access and exports; Canvas is only used for display, never scientific input.

One observation per condition, Chrome154.0.8037.58 on the current Mac; no OS or
GPU-driver cache reset. Local asset reads, desktop and neighbouring light work
remain active. This supports a local qualified optimization, not universal speed,
WordPress latency or physical-device coverage. No development measurement runs
as a user startup calibration. See `segmentation-mpdn-common-benchmark.json`.

## Reproduction and remaining scope

```sh
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.build/onnx-python ../venv/bin/python scripts/rewrite-segmentation-concat.py mgcfdn-mpdn
python3 scripts/build-segmentation-gpu-runtime.py --stage
node scripts/study-segmentation-gpu.mjs mgcfdn-mpdn --model gpu-concat
node scripts/study-segmentation-common-worker.mjs --backend auto
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-segmentation-npz.py gpu-common
node scripts/benchmark-segmentation-common.mjs
```

These commands assume the already verified local model conversion and synthetic
ROI fixtures. They download nothing and train nothing. The benchmark needs a
coordinated free slot; no simultaneous heavy studies. GPU weights are separately
pinned, never embedded in the runtime/source delivery. CPU model remains needed
for the explicit CPU choice. Licenses and reproduction identities accompany the
JSEP runtime; model redistribution rights remain a separate decision.

The native Mac app is unchanged. Ordered Concat grouping is reusable by a future
native WebGPU/ORT consumer facing binding limits; no native Torch speed benefit
has been measured or claimed. Four numerically rejected MGCF variants, both
CMSeg-Net ports, useful ROI parallelism and larger-image support remain M1 work.
B owns WordPress integration; the coordinator owns shared release assembly.

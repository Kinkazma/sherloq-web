# MGCF 16 and EffNet: shared-model GPU/CPU inference

M1.41 enables the existing bounded ONNX WebGPU/WASM worker for MGCF16 and
EffNet. Both use exactly the qualified CPU model bytes and checkpoint identity.
EffNet uses the repaired `native-mean.onnx`, preserving its native normalization
and pooling order. No weights, input dimensions, thresholds or precision change.
The layout inspection found no wide Concat in either graph, so no rewrite is
needed. Unsupported operators, including TopK, still execute on CPU.

`loadSegmentationModel` admits the CPU URL as the shared GPU URL. `auto` selects
this route only with the required WebGPU capabilities and shared memory budget;
explicit `cpu` is preserved. No benchmark, canary, calibration or model download
is inserted into startup. The first useful inference loads one model/session;
subsequent independent zones reuse it. Idle sessions remain reclaimable. CPU
zones retain their bounded concurrency; the hybrid path retains one outer lane.

## Actual worker comparison

Chrome154, float32, the same 2GiB admitted budget per condition. Each backend has
a fresh page and session, followed by two warm inferences on the same positive
`paired-spots` input. OS/driver caches are not cleared; this is a shared workstation.
No profiler runs during these measurements. The remaining native corpus follows
without loading another model. Fixture/oracle comparison storage is outside the
product admission; accounted memory is not browser/driver RSS.

| Variant | CPU cold / warm / warm, ms | Hybrid cold / warm / warm, ms | CPU / hybrid accounted peak, B |
| --- | --- | --- | --- |
| MGCF16 | 1013.8 / 490.0 / 488.9 | 1652.9 / 113.0 / 100.8 | 1346552999 / 1883423911 |
| EffNet | 1329.8 / 465.6 / 463.0 | 1748.0 / 128.2 / 132.7 | 1302031502 / 1838902414 |

Warm inference means improve 489.45 to106.9ms and 464.3 to130.45ms. Preparation
plus inference plus full small-source projection means improve 535.65 to156.3ms
and 513.85 to180.25ms. Cold GPU is slower and uses more admitted memory. These
are component observations, not a claim of universal full-application speedup.

The actual GPU buffer peaks over five calls are389844800 and417108800B. The worker
continues to reserve/enforce a512MiB GPU ceiling, separately from its512MiB WASM
ceiling, under the parent budget. WASM observed heaps are205258752 and209518592B.
Every GPU allocation is admitted; submitted buffers remain charged until their
queue lifetime ends. One model request per backend, zero requests on warm runs;
all final product ownership returns to zero.

## Continuous values and decisions

Preparation is exact against the native tensor. MGCF16's largest GPU probability
error is3.308058e-6, with mean1.043934e-7 on that case; all projected masks are
native-exact. EffNet's largest error is4.172325e-6, mean3.379976e-7 on `paired-spots`.
Probabilities are normalized values in[0,1], not logits.

EffNet changes one pixel at(17,51) on the256×256 positive case: native probability
0.5000031590461731 becomes0.4999992847442627, crossing the unchanged0.5 threshold.
Foreground count changes7373 to7372. Eight-connected component areas change
[4241,3132] to[4241,3131]; no component splits, joins, appears or disappears on
this case. The other two cases have exact masks. The same one-pixel difference
recurs in all three repeated positive inferences. This is accepted under the
declared numerical latitude with the measured warm speed improvement. It is
not hidden by loosening the threshold or claiming binary values are floats.

The EffNet GPU identity carries `numericalParity`, which is used by result and
NPZ provenance. Explicit CPU preserves the reference route. This corpus does
not establish that every future mask or decision will be equal. The earlier
strict-mask GPU study remains recorded as rejected; its result was not relabeled.

## Full-source and API evidence

The new MGCF16 recipe uses an original12000×8000 rich JPEG, two large ROI and a
full envelope, preserving native256×256 network preparation. All source-coordinate
planes, a cache-only composition and the independently owned paged NPZ are checked
against actual native inference. This is the larger-model-byte representative
of the shared sigmoid GPU adapter used by MPDN/MGCF16/EffNet; EffNet is covered
for this memory path, not claimed to have a newly executed96MP network case.

The96MP run has2400483 native-exact foreground pixels, then1514752 in the cached
view. Maximum full-map error is1.937151e-6, mean3.839327e-8. Load1.3804s,
analysis21.1667s (projection5.8911s included), cached view2.8654s, NPZ
preparation16.0656s. Peak3088028932B is below the3GiB shared budget; source and
both results use RAM, export uses OPFS. The672012768-byte NPZ has SHA256
`7f4415a9faafb062ebe7be21b2fff73545fe97d8e695e366467a1959540eb1ff`.
All four complete planes and both masks are checked. These functional timings
do not establish a new96MP CPU/GPU speed ratio; full export readback is verified
separately from archive preparation timing.

Fresh copied-runtime API recipes for both variants exercise automatic GPU
selection, original bytes, full planes, cached composition, complete NPZ readback,
cancel during useful GPU inference, ownership cleanup and source reload.
Exact runtime/source binding and the measurements are in
[the delivery binding](mgcf-ort-delivery-binding.json). Independent NumPy checks
validate names/types/shapes, CRC, SHA and every exported native-coordinate value.
Existing CPU96MP ST evidence is reused for the unchanged CPU adapter.

## Rejected candidates and remaining work

Base MGCF and source/target reach the512MiB GPU buffer admission boundary before
finishing their1600×1600 consistency stages: observed peaks529068000 and534608464B.
Both graph identities equal their qualified CPU exports, and cleanup returns all
reservations to zero. They remain CPU-only in this release. The current JSEP
runtime retains buffers in per-size pools; options in ORT's separate native
WebGPU provider do not configure this JSEP allocator. A bounded retention or
streaming change needs separate implementation and measurement; increasing a
ceiling alone is not a qualified solution. CMSeg addnoise also remains CPU.

No WordPress cohabitation, additional browser/GPU vendor or physical mobile
qualification is implied. The measured cache/session reuse and GPU placement
are ideas for a separate Mac experiment; no native code or Mac gain is delivered.

## Reproduce locally with existing verified assets

Run `scripts/study-mgcf-ort-workers.mjs mgcfdn-16` and the EffNet variant. Reports
are `mgcf-ort-mgcfdn-16-workers-proof.json` and
`mgcf-ort-mgcfdn-effnet-workers-proof.json`. Each pins its actual sources.
The four initial profiling probes use `scripts/study-segmentation-gpu.mjs` with
`--model gpu-concat`; `scripts/rewrite-neural-gpu-concat.py` validates source
identity and emits byte-identical candidates for these four graphs. Keep these
functional profiling observations separate from the worker timing comparison.

The full-source recipe is `scripts/study-neural-segmented.mjs` with
`--variant=mgcfdn-16 --gpu --auto --large --rich --tag=m1-41-candidate`; validate
with `scripts/check-neural-segmented-npz.py`. Copied API recipes use `--gpu --auto
--tag=m1-41` and `--runtime-root` pointing at the verified immutable runtime.
References, original JPEGs, weights and exported NPZ files remain development
assets outside the portable delivery. No private images, remote service or
training are used.

# Independent neural regions — M1.32

The five single-thread ONNX CPU variants (MGCF base,16,MPDN,EffNet and ST)
now process independent native rectangles concurrently when the shared budget
admits them. Each rectangle keeps its complete native preparation and inference;
this does not partition a model's global search into independent tiles. The
source coordinate composition still follows the original zone order.

## Admission and lifecycle

The planner uses the actual number of distinct bounds, hardware concurrency,
owned source/live reservations, reusable idle session reservations, the shipped
512 MiB WASM ceiling, three model-byte copies, crop/preparation staging and pinned
raw grids. This is an eligibility estimate; every actual allocation still goes
through the same global Budget. Cached data and idle sessions remain reclaimable.
Identical bounds within one task share their probability grid.

Useful jobs start immediately. ONNX workers use exactly one internal thread.
CMSeg, TNT and VIG keep their existing internal pools, and the MPDN GPU hybrid
keeps one GPU session in this increment. They do not receive an outer pool.
There is no startup probe, calibration, persistent speed profile or extra
scientific setting. CPU remains explicitly selectable.

If concurrent work encounters MEMORY_LIMIT, no new parallel job is launched.
Active work drains, its reservations are released, and only unfinished zones are
retried serially. A refusal with one lane remains an explicit error. Model or
transport errors cancel sibling work and wait for its cleanup before returning.
Caller cancellation and session disposal also await cleanup. Idle model sessions
are reused for later actual work, or evicted by the common budget. Before a
segmented projection, idle sessions are released as needed to leave room for the
requested full-size result and its staging. This prevents unnecessary temporary
planes while preserving warm sessions on smaller tasks. Released reservation
bytes appear in `execution.projectionReleasedSessionBytes`.

`metadata.execution.independentZones` reports requested and observed concurrent
jobs, memoryBackoffs and internalThreadsPerWorker. The metadata travels with
owned results, raw views and NPZ exports. `timings.zoneWallMs` measures elapsed
zone preparation/inference. Existing accumulated stage timings are sums of
per-job elapsed times and can exceed wall time when jobs overlap; they are not
CPU utilization percentages. Model identity, thresholds, precision and input
sizes are unchanged.

## Measured increment

One cold-context and one warm-session MPDN observation per condition in Chrome
154, same three public native regions, same 3 GiB budget. The only product
change is scheduling/retention. Warm work changes one source pixel outside the
regions, forcing real inference on the identical crop inputs. Loopback assets
and OS/driver caches are not flushed. These are development measurements.

| Actual operation | Serial M1.31 | Three concurrent workers | Ratio |
| --- | ---: | ---: | ---: |
| Cold analysis RPC | 1.2605 s | 0.7879 s | 1.60× |
| Warm analysis RPC | 0.9715 s | 0.4057 s | 2.39× |
| Cold source through both exports | 1.3891 s | 0.9128 s | 1.52× |
| Warm source through both exports | 1.0268 s | 0.4601 s | 2.23× |

All probability grids, composed maps and masks have identical SHA256 between
serial and parallel conditions. Native discrepancies are unchanged, not declared
bit-exact against native. Model-load elapsed sums increase because each active
worker owns a session; warm model loading is zero. Peak accounted memory rises
from 1,188,981,804 to 2,406,758,032 bytes, below the same 3 GiB limit. These are
reservations including heap ceilings and staging, not process RSS. Smaller
budgets retain fewer workers, including the original single-worker path.

The MPDN cold/warm reports are `segmentation-mpdn-common-benchmark-serial-m1-31`
and `segmentation-mpdn-common-benchmark-parallel-candidate` (JSON). Six targeted
scheduler tests cover shared admission, out-of-order completion, pressure and
serial retry, sibling cancellation/cleanup, cache ownership and deduplication.
The eight existing segmentation admission/identity tests remain applicable.

## Large-source coverage and next work

A native 12000×8000 ST case with two large regions and a full-image envelope has
3,370,950 foreground pixels. Its first browser chain and complete NPZ verification pass: six fully checked
planes, exact mask, maximum probability error1.728535e-5, mean map error1.262513e-7.
Analysis24.0904s, cached view8.0496s and paged NPZ33.8495s, peak3,210,292,828 bytes
under3GiB. The idle-session retention refinement is measured separately below;
these are functional observations on a shared workstation, not native speed ratios. Native 256/512 model inputs are unchanged. Fixed-grid arithmetic proofs
remain reusable, but the source, projected output and export must be tested at
96 MP. CMSeg/TNT/VIG and additional GPU coverage remain distinct work until their
actual memory paths are covered. WordPress cohabitation belongs to integration.

No Mac change is included. The reusable scheduling principle is independent
region jobs under a global budget and single-thread inner inference. Native
thread counts and tensor/session ownership would need their own measurements;
the browser ratios above are not a native acceleration claim.

### Retention refinement on the same96MP input

Only idle-session retirement changed after the first96MP observation. All six
arrays of both the analysis and cached view retain exactly the same SHA256.
The revised run releases1,611,297,256 bytes of session reservations before the
first projection and another805,648,628 before the cached view. The initial six
planes now fit RAM; the cached view retains five in RAM and candidates in OPFS,
while the earlier result stays independently owned.

Analysis20.5802s (projection11.2424s included), cache-only view5.6828s, load1.2001s,
NPZ49.5025s; accounted peak3,191,856,000 bytes below3GiB. The earlier projection
was14.6975s and cached view8.0496s. NPZ preparation is slower in this observation,
so this is a local projection/storage improvement, not an end-to-end speedup
claim. Other development was active on the workstation. The complete export
has1,440,012,552 bytes; metadata differs, scientific arrays do not. Both runs
release every reservation/store. Independent NumPy checks verify all six planes,
CRC, SHA, types, coordinates and metadata. See the `projection-retention` browser
and NPZ reports. This family uses a fixed-size network and no source-resolution
component graph; its nonempty mask exercises millions of projected detections.

Reproduction (pinned local reference environment, no downloads):

```sh
PYTHONDONTWRITEBYTECODE=1 ../integration/clone_detectors/.venv-validation/bin/python scripts/generate-neural-segmented.py mgcfdn-st --large --rich
node scripts/study-neural-segmented.mjs --variant=mgcfdn-st --large --rich --tag=projection-retention
PYTHONDONTWRITEBYTECODE=1 ../venv/bin/python scripts/check-neural-segmented-npz.py mgcfdn-st --large --rich --tag=projection-retention
node --test tests/segmentation-zone-scheduler.test.mjs tests/segmentation-admission.test.mjs
```

The96MP recipe scales the public copy-pattern source across the full canvas,
adds deterministic bounded per-pixel noise and JPEG-encodes it. Two large source
regions and a full-image envelope are actually inferred. Generated pixels,
weights and private oracle arrays remain outside the delivery. This proves the
common CPU ONNX/ST six-plane segmented memory path with native256 preparation.
It covers the same source/zone scheduler used by the other four single-thread
CPU variants; their own small-corpus numerical qualification is retained. It
does not by itself qualify CMSeg512, TNT/VIG internal pools or a GPU96MP path.

# M4 segmented stereogram

`various.stereogram` accepts segmented JPEG sources and the original `mode` 0–3.
The period search uses the complete native half-height grayscale image, including
odd-height rounding. Independent band workers sum exact integer differences for
all native offsets; the owner combines global sums and retains the original
float32 adjacent-difference decision. There is no per-tile period selection.

The pattern is the shifted full-resolution RGB absolute difference, normalized
with complete-image extrema per channel. Mode1 uses the complete grayscale
histogram for the native triangle threshold and a halo-correct 3×3 median.
Mode2 normalizes the complete horizontal Farneback field; mode3 shades the
pattern with that field before complete-image normalization. Source reads,
pattern, flow storage, render intermediates and outputs support segmented
RAM/temporary storage. Native global statistics and borders are preserved.

Farneback runs in a dedicated worker with streamed inputs: two cropped grayscale
planes are filled directly from oriented RGB bands. The same pinned OpenCV
Farneback, Gaussian and resize arithmetic runs on the whole pair, then drains
its horizontal float32 output to segmented storage. Internal pyramids remain
in RAM, admitted at 96 bytes per cropped pixel plus 8 MiB and bounded staging,
with a 1900 MiB module allowance. This reduces the previous source-copy and
monolithic-JS cost; it does **not** claim a tiled optical-flow algorithm or an
unbounded disk pyramid. If that complete stage cannot fit, modes0/1 remain
available and modes2/3 report `MEMORY_LIMIT` without resizing or substitution.
No GPU Farneback replacement or runtime calibration is introduced.

## UI and ownership

A detected period returns `layout: "surface"`, RGB `surface`, metadata and the
original float32 search differences. `data.comparedBounds` identifies both
source crops; layer coordinates are `cropped-stereo-pair`, with origin `[0,0]`
in the paired output. These are relative horizontal disparities, not physical
length/depth or authenticity scores.

Modes2/3 also return `tables.flow`: `readTable` pages contain `[row,column,
horizontal_disparity]` as float64 transport values representing the stored
float32 field exactly. `readTableCsv` supplies bounded CSV pages. Release tables
with `releaseTable`; release RGB with `releaseSurface`. JSON exports describe
metadata and handles, without forcing a full field copy.

No detected period returns `status: "ok"`, `layout: "none"`, `data.detected:
false`, `data.offset: null`, empty layers, and no surface. The UI must show the
absence of evidence, not fabricate a zero-valued disparity raster.

Search, normalized pattern, lazy flow and each requested view are cached.
Changing mode never reruns a completed search or flow. Published handles retain
independent leases through cache teardown until their mandated release;
source unload invalidates all its public handles. Cached metrics retain the
search pool's worker count/job count; cache flags and progress indicate work
actually repeated. Direct cancellation cleans incomplete stages; worker-client
hard cancellation reports cleared sources and permits reload. The native flow
worker can be terminated while its synchronous global solver runs.

## Checks

`tests/stereo-stream.test.mjs`: 27 nontrivial native searches and 25 bit-exact
Farneback fields; native 1MP worker heap observed around 87.5 MB.
`tests/stereogram-segmented.test.mjs`: all 28 search/absence cases, 100 native RGB
views, all raw-flow hashes, phase cancellation and leases pass. Seven source-API
checks also pass. The public Chrome worker test covers a JPEG1024² with the four
native view hashes and exact raw field under512/160MiB; modes0/1 under64MiB;
cache reuse, absence, cancellation during global flow, recovery and cleanup.
The native JPEG oracle is generated only under this worktree's `.build`.
See `docs/stereo-stream-browser-proof.json` for actual measurements and forced
OPFS surface/flow storage qualification. Fixtures/node_modules remain read-only.

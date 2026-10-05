# Segmented luminance gradient — M1 0.30.0-m1.23

`detail.gradient` accepts segmented JPEG sources from `loadBlob`. The four blue
channel modes, intensity0–100, inversion and per-channel equalization keep their
native meanings. The result is an owned full-resolution RGB8 surface; read it
with `readPixels`, release it with `releaseSurface`, or unload its source. Earlier
result handles remain usable after a later gradient calculation.

```js
const source = await engine.loadBlob({id: 'photo', blob: file});
const result = await engine.run({id: 'gradient', imageId: source.id,
  operation: 'detail.gradient', params: {mode: 3, invert: true, equalize: true}});
const window = await engine.readPixels({surfaceId: result.surface.id,
  revision: result.surface.revision, rect: {x: 0, y: 0, width: 512, height: 512}});
await engine.releaseSurface(result.surface.id);
```

There is no whole-image pixel transfer or resize. The surface coordinates refer
to the oriented source; the original encoded bytes, hash and decoding policy
remain unchanged. Both public operation lists advertise this segmented adapter.
JSON records its surface/provenance; a complete streamed image export is outside
this increment.

## Global arithmetic across bounded bands

1. Read oriented RGB rows with a one-row halo. Convert using the qualified native
   integer luminance coefficients and calculate the native3×3 spatial derivatives
   with reflect101 image borders. Store signed16-bit `dx,dy` pairs; each value is
   exact. Halos never enter the global statistics twice.
2. Collect **whole-image** maxima of absolute derivatives and extrema of their
   sum. Zero derivatives retain neutral direction127.
3. For blue mode3, scan the stored derivatives to obtain whole-image extrema of
   the float64 lengths of the normalized red/green channels, after inversion.
4. Render using those common extrema. Preserve float32 direction/magnitude
   arithmetic, float64 length normalization and the native fused multiply-add
   rule, including its small-image exception. Collect whole-image RGB histograms.
5. Apply the native intensity LUT or equalization LUT, using the complete-image
   histogram. Equalization overrides intensity. Cumulative counts are converted
   to float32 at the same arithmetic boundary as native OpenCV.

Statistics are never recomputed independently for each band. Band width is the
oriented image width; band height changes only storage scheduling. Intermediate derivatives are either retained in the admitted private cache described
below or disposed once the result is complete; partial outputs are never published.

## Memory and cancellation

`vendor/gradient/gradient.wasm` has one fixed64MiB memory, with initial and maximum
1024WASM pages. Growth is disabled. Its binary is about16KiB, not64MiB; the latter
is the admitted addressable heap capacity. Build sources, compiler settings,
musl notice and identities are retained with the module.

The shared engine admits this heap alongside already resident codecs. Oriented
row buffers, halos, returned blocks, histogram/LUT and storage I/O use a separate
conservative staging reservation. Band height is reduced to available RAM and
the fixed arithmetic heap. A complete row that cannot fit is refused before
reading; no scientific setting or source resolution changes. Derivative storage
uses4bytes/pixel and the owned output3bytes/pixel, retained in RAM when admitted
or in the source's temporary session otherwise. Browser process/Blob overhead is
not included in these accounting measurements.

After first use, the64MiB module remains resident and is included in subsequent
common-engine admissions. Public worker cancellation closes temporary storage
before terminating, reports `imagesCleared:true`, and requires source reload.
Direct cancellation preserves the source and discards partial intermediate and
result stores. Native int32 equalization is explicitly limited to2147483647pixels;
larger equalized requests receive `NUMERIC_RANGE`.

## Qualification

- `tests/gradient-math.test.mjs`: all640 existing native gradient outputs exact
  through the staged arithmetic, including1/2-pixel, flat and odd-sized inputs.
- `tests/segmented-gradient.test.mjs`: the same640 native outputs exact through
  actual segmented stores and seven-row bands; eight orientations with1/5/67-row
  bands; cancellation during derivatives, lengths, rendering, tone and completion;
  retry, refusal before reads and zero residual reservations/stores.
- `scripts/generate-large-gradient.py` runs the unchanged native GradientEngine
  on the complete public synthetic12000×8000JPEG. Three outputs cover magnitude,
  inverted float64 length with intensity, and inverted/equalized length.
- `scripts/study-segmented-gradient.mjs` uses the common worker under256MiB.
  All three **complete-image SHA256 hashes** and four windows per image match
  native. Independent result ownership, release/unload, cancellation after
  global preparation, temporary cleanup and reload/retry pass. The copied-runtime
  recipe is recorded separately from the development run.

Completed-task snapshots recorded a175028128-byte admitted peak and170655744bytes of
resident codec/arithmetic heaps. Final retained/cache/active bytes and temporary
artifacts were zero. Functional RPC observations were about1.79s for magnitude,
4.40s for the inverted length/intensity view and4.80s for its equalized view.
Stage timings are in `segmented-gradient-baseline-chrome[-extracted]-proof.json`. These
single observations are not isolated performance comparisons or a speed claim.

One CPU worker executes the qualified stages. Useful parallelism remains separate optimization work; no GPU path is announced.
The native Mac already has a bounded gradient path, so this delivery does not
establish an additional Mac speed gain. WordPress and segmented PNG/TIFF wiring
are outside this increment.

## Exact lookup optimization in .9

The fixed64MiB kernel now reuses two exact tables. For mode3, all65536 red/green
byte pairs are evaluated with the same sqrt and native normalization/FMA rule,
using the extrema measured on the actual image. This is not normalization of
the complete table. A second table evaluates all2041 possible signed Sobel
derivatives, separately for each direction, maximum and inversion. Keys include
every arithmetic dependency; neither table contains image pixels or a detector
substitute. Together they use69618bytes inside the already admitted fixed heap.

`gradient-optimizations-chrome-proof.json` compares flags0(baseline),1(length
table),3(plus directions),7(plus deferred sqrt for integer extrema). Each passes
all640 native outputs and the complete96MP native SHA. Flags3 are selected;
flags7 showed no additional benefit in this observation and are not the default.

With one CPU worker, the observed warm RPC times were4208.1,2911.7,2454.0 and
2491.7ms respectively. Flags3 reduced the cold measured source-to-view/export
chain from7511.5 to5031.4ms and the warm chain from4232.3 to2463.0ms. These are
one cold/one warm observation per condition, not statistical or universal claims.
The chain includes load, calculation, one257×63 window, two derived Canvas frames
and JSON metadata export; fetching the Blob, hashing the full output and WordPress
are outside it. Preparation, calculation, transfers, rendering and memory are
reported separately. There is no product-time benchmark or calibration.

The selected runtime is rechecked by `segmented-gradient-chrome-extracted-proof.json`.
This lookup increment is independent of the later derivative cache; useful
multiworker scheduling remains separate work. The
Mac reuse opportunity is documented in `GRADIENT-LOOKUP-MAC.md`, without changing
the native application or claiming a measured Mac gain.


## Count conversion correction (.18)

Global channel equalization now calls the shared `equalizeHistogramLut`, including
OpenCV's float32 denominator conversion above2^24 pixels. Two existing native
16,777,218-sample histograms reproduce the former one-byte deviation on25,165,824
RGB components each; corrected populated LUT entries are exact. The proof concerns
the histogram display stage, not a claim that every source image will exhibit this
histogram. All640 complete native gradient views, eight orientations and lifecycle
checks still pass. See `gradient-counts-proof.json` and its compact Chrome recipe.
Native OpenCV already applies these conversions; no Mac modification is needed.

## Private derivative reuse (.23)

A source/geometry-keyed RAM cache retains the signed Sobel pairs and the first
four global derivative statistics. This 4N-byte value is the working store itself,
not a second copy of it. The cache excludes mode, inversion, intensity and
histogram settings. Length extrema are initialized afresh on every mode3 view;
rendering and tone statistics are recomputed. Cached views perform zero source
reads and zero derivative kernels, while the rendering worker remains active.

The entire value is pinned during use. Bounded copies isolate the private chunks
from arithmetic and owned result surfaces. New partial values are discarded on
any failed/cancelled task; a complete borrowed cache survives direct cancellation.
It is evictable independently of earlier result surfaces and cleared on source
unload. Admission protects working-band headroom and a RAM-only output when no
temporary session is available; an unadmitted cache keeps the existing RAM/temp
working-store path. There is no hidden temporary-store lifetime in the LRU.

`gradient-cache.test.mjs` checks all640 native views with reuse, mode/inversion
changes, all8 orientations, owned outputs, every-stage cancellation, eviction and
low-budget no-cache execution. The uncached640-view suite remains exact.
`gradient-cache-chrome-proof.json` isolates .22 versus .23 at the same1GiB budget,
one CPU worker,96MP mode3 inverted/intensity33, one cold and warm task each:
RPC1722.0/1690.2ms without cache versus1728.4/1209.5ms with it. The observed warm
RPC improvement is1.40×; no cold gain is claimed. Source-to-view/JSON chains were
3904.8/1709.7ms versus3926.7/1230.1ms. Blob fetch and full SHA checks are outside
timing. The retained cache is384001776bytes; accounted peaks849125280 and849127056
bytes are effectively unchanged because it replaces the existing slope store.
These observations exclude browser process/Blob residency and are not universal.

The normal and copied-runtime `segmented-gradient-cache-chrome[-extracted]-proof.json`
recipes preserve all three full96MP native hashes across changed modes, JSON,
previous owned results, cached cancellation, fresh reload and complete cleanup.
The256MiB streaming path does not require this384MB optional cache. No GPU claim,
startup benchmark or new resolution/precision/quality rule is introduced.

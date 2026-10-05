# Segmented color-space conversion — M1 0.30.0-m1.7

`colors.space` now runs on segmented JPEG sources from `loadBlob`. All nine
families retain their existing parameters: RGB, CMYK, four grayscale definitions,
HSV, HLS, YCrCb, XYZ, Lab and Luv, for 29 channel choices. The existing qualified
OpenCV/WASM conversion is reused without a new approximation or hidden resize.

```js
const source = await engine.loadBlob({id: 'photo', blob: file});
const result = await engine.run({id: 'channel', imageId: source.id,
  operation: 'colors.space', params: {space: 'hls', channel: 2}});
const region = await engine.readPixels({surfaceId: result.surface.id,
  revision: result.surface.revision, rect: {x: 100, y: 200, width: 512, height: 512}});
await engine.releaseSurface(result.surface.id);
```

The result is `layout:'surface'`, with an owned full-resolution RGB8 grayscale
visualization. Its origin is `[0,0]` in the oriented source. There is no complete
pixel buffer transferred through RPC. Earlier result handles survive later
channel calculations until explicitly released or until the source is unloaded.
The JSON result records the handle and provenance, not an embedded complete image;
streamed image export remains a separate consumer responsibility.

## Preserve row arithmetic

The native float HSV/HLS implementation distinguishes the vector prefix from the
scalar tail of each row. Reordering pixels or converting the un-oriented source
before rotating it can therefore alter final uint8 values. This adapter first
reads **complete oriented rows**, retaining their original width, and converts
row groups. Storage seams and the number of rows per group have no algorithmic
meaning. No neighborhood halo or global histogram is needed for this operation.

The output store uses oriented dimensions and orientation1. Source decoding,
ICC/depth policy, original bytes and original hash are unchanged. The public
source and engine capability lists advertise the added segmented operation.

## Budget and lifecycle

Existing codec heap capacity is admitted by the common engine. Before allocating
output storage, the adapter reserves room for at least one complete row, a32MiB
OpenCV initialization/growth allowance and possible IndexedDB staging. Row groups
target262144pixels but shrink to fit the shared budget. The conservative kernel
reservation is64bytes per staged pixel plus the allowance; the source window
and its row scratch are admitted separately. If even one row cannot fit, the
operation fails with `MEMORY_LIMIT` before reading or resizing it.

Output uses retained RAM when it fits, otherwise the source's owned temporary
session. The existing OpenCV module is reused; this increment does not give its
2GiB theoretical WASM maximum a new per-task hard cap. Actual admitted inputs,
observed heap capacity and the shared accounting bound the tested working sets.
Blob/browser process overhead is not measured as zero RAM.

Cancellation releases staging and unpublished outputs. Public pixel-worker
cancellation closes storage then terminates the worker and reports
`imagesCleared:true`; reload is required. Direct cancellation keeps the source
usable. No new result cache, multiworker conversion or GPU gain is claimed.

## Qualification

- `tests/segmented-color-spaces.test.mjs`: all290 pre-existing native channel
  checksums with both1-row and7-row groups (580comparisons), plus232 comparisons
  against the qualified contiguous path across eight orientations. Includes
  grayscale/CMYK black, scalar tails, odd dimensions, rows/columns, cancellation,
  refusal before reads, retry and complete reservation release.
- `scripts/generate-large-color-spaces.py`: unchanged native SpaceEngine on full
  width row bands of the existing public synthetic12000×8000JPEG. Complete-image
  reference hashes for HSV hue, HLS saturation and Luv u; four windows each.
- `scripts/study-segmented-color-spaces.mjs`: real common worker under256MiB;
  three complete native hashes and all windows exact, independent result
  ownership, release/unload, cancellation/storage cleanup and retry. Development
  and copied-runtime proofs are `segmented-color-spaces-chrome[-extracted]-proof.json`.

Completed-task snapshots recorded187575744bytes as their maximum admitted peak
and137101312bytes
of resident codec heap capacity after reload. Final retained/cache/active bytes
and temporary artifacts were zero. The prior154021312 figure was the final
worker after cancellation/reload, not the maximum of earlier snapshots. Read/kernel/write/load/RPC timings are
recorded for diagnosis, not presented as isolated speed benchmarks.

Large transposed sources remain potentially I/O-heavy because exact oriented-row
reads traverse source columns. Eight-orientation correctness tests do not assert
96MP transposed throughput. The native Mac engine already has a bounded color
path; no additional demonstrated Mac speed gain follows from this browser adapter.
WordPress wiring and segmented PNG/TIFF are not claimed by this delivery.

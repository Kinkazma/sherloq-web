# Magnifier on segmented sources — M1 0.30.0-m1.6

`inspection.magnifier` now accepts the segmented JPEG sources returned by
`loadBlob`. It reads the requested oriented ROI and applies the existing native
magnifier kernel at its original resolution. This closes the prior
`UNSUPPORTED_LAYOUT` for this operation. It does not require a contiguous copy of
the complete source.

```js
const source = await engine.loadBlob({id: 'photo', blob: file});
const result = await engine.run({
  id: 'magnify', imageId: source.id, operation: 'inspection.magnifier',
  params: {bounds: [100, 200, 1124, 968], mode: 'contrast', percent: 20, channel: false}
});
// result.pixels is the owned RGB8 region at full resolution.
// result.data.bounds and result.layers[0].origin retain source coordinates.
```

Bounds are ordered integer, half-open source coordinates after orientation. They
are clipped exactly as in the existing native and contiguous paths. An empty
clipped region returns `data.empty:true` without a pixel plane. `bounds:null`
means the complete image; it may produce `MEMORY_LIMIT`. The engine never shrinks
the requested region to fit. Equalization, contrast percent and per-channel
semantics are unchanged. Original encoded bytes and their digest are retained.

`loadBlob.availableOperations` and `capabilities.sourceAccess.segmentedOperations`
include this operation. The corresponding operation constraint declares
`workingSet:'selected-region'`, `resultLayout:'contiguous'` and
`regionMustFitBudget:true`. This is an owned contiguous **ROI** result, not an
image-sized result-surface handle. JSON export keeps its pixels and origin; no
new export format is introduced.

## Memory, cache and cancellation

The shared budget admits the resident codec heaps, then a conservative
`12 * ROI_pixels + 8192` byte work reservation. The source-window reader separately
admits its RGB buffer and one source-row scratch buffer. No dimension of the
whole image enters the magnifier scratch calculation. Browser-managed original
Blob residency and browser runtime overhead remain outside the measured budget;
these are not claims about total process RSS.

Completed input windows and completed results enter the shared bounded LRU.
Input windows are reusable across contrast/equalization settings. Keys include
source ID, surface identity/revision, clipped bounds and validated parameters.
Result hits return owned copies, so changing the caller's returned pixels cannot
corrupt later results. Source unload invalidates both caches. Eviction is allowed
to turn a prospective hit into a fresh read when another admitted task needs RAM.

Direct cancellation releases the window and work reservations without publishing
a partial cache entry. The **public worker retains the existing pixel-job
cancellation policy**: it closes temporary storage before terminating, reports
`imagesCleared:true`, and requires a reload. This increment does not change that
policy to the cooperative neural-model cache policy.

## Evidence and limits

- `tests/segmented-magnifier.test.mjs`: 440 native output checksums, arbitrary
  storage seams, eight orientations, clipped/empty regions, bounded caches,
  mutation isolation, memory refusal before reading and cancellation/retry.
- A virtual 100000×90000 source checks access discipline without allocating that
  image: a 65×67 ROI reads exactly 13065 source bytes; the full-image request is
  refused before any additional read. This is an access test, not a giant JPEG
  decoder or total-memory benchmark.
- `scripts/generate-large-magnifier.py` runs the unchanged native MagnifierEngine
  on the existing public synthetic 12000×8000 JPEG. Five zones × seven settings
  produce 35 independent native references, including empty and clipped zones.
- `scripts/study-segmented-magnifier.mjs` runs the actual public worker on that
  JPEG under 256 MiB. The checked outputs are bit-exact; input/result cache,
  JSON roundtrip, original bytes, full-image refusal, cancellation, reload and
  unload pass. `docs/segmented-magnifier-chrome-proof.json` records the development
  run; the companion `-extracted-proof.json` records the versioned runtime copy.

Completed-task snapshots across worker lifetimes recorded a maximum admitted
161475132 bytes, including
codec heaps, and no final retained/cache/active bytes or temporary artifacts.
The prior129005192 figure described only the final worker after cancellation
and reload; earlier task peaks are retained in the same proof.
Timing fields separate load, window read, kernel and worker roundtrip, with cold
and cache-hit samples. They are not isolated comparative speed benchmarks.

This adapter uses the existing single CPU worker. No GPU/parallel speed gain is
claimed for these ROIs. The native Mac magnifier already works by ROI; this change
adds the browser storage adapter and has no separate demonstrated Mac speed gain.
WordPress wiring, segmented PNG/TIFF decoding and other unqualified segmented
pixel operations remain outside this increment. TNT/VIG remain unavailable under
the numerical limitations documented in the segmentation contract.

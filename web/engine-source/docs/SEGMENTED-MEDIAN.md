# Median-filter detector on segmented sources — M1 0.30.0-m1.15

`various.median` accepts the engine's segmented JPEG surfaces and the same
explicitly imported numeric XGBoost model as the contiguous detector. The model,
feature definitions, block domain and thresholds are unchanged. No weights,
training, substitute detector or new probability tolerance are introduced.

```js
await engine.loadMedianModel({id: 'median-model', blob: localModelFile});
const source = await engine.loadBlob({id: 'photo', blob: imageFile,
  layout: 'segmented'});
const result = await engine.run({id: 'median', imageId: source.id,
  operation: 'various.median',
  params: {modelId: 'median-model', variance: 5, threshold: 0.4,
    showScore: false, speckle: true}});
const preview = await engine.readPixels({surfaceId: result.surface.id,
  revision: result.surface.revision,
  rect: {x: 0, y: 0, width: 512, height: 512}});
const json = await engine.exportResult(result, {format: 'json'});
await engine.releaseSurface(result.surface.id);
await engine.releaseSurface(result.maskSurfaces.valid.id);
await engine.releaseSurface(result.maskSurfaces.decisions.id);
```

`loadBlob.layout` is optional: `auto` retains the existing budget-based selection;
`segmented` explicitly requests the bounded decoder without changing pixels or
resolution. This branch supports JPEG for that request. Unsupported formats fail
with `UNSUPPORTED_LAYOUT`; it is not permission to substitute a Canvas decode.
This option is useful when a later analysis should use bounded source access even
though the initial contiguous load would fit. M5 owns additional format adapters.

## Native scientific contract

The source is read in its exact oriented coordinates. At most32 consecutive
64×64 gray blocks are prepared together, including batches crossing block rows.
An image dimension divisible by64 still gets the historical extra black block;
the score map has a further zero row/column. All actual padded blocks are analyzed.
Formats8/24/96/128 retain their original feature windows and levels. Prediction
still casts features to float32, traverses the same forest and adds float32 margins
in the original order. General expf identity remains a documented limitation;
the existing probability bound1e-7 and independent decision checks are unchanged.

The complete compact score grid is filtered by the native3×3median when requested.
Variance validity and float32 threshold comparison produce raw grid classes:
0 invalid,1 below threshold,2 at or above threshold. RGB score/class display uses
the original factor64 linear interpolation,11-bit coefficients, separate vertical
truncations and source crop. Row groups use absolute output coordinates. The RGB
view is not a full-resolution segmentation mask.

Returned `data` retains geometry, float32 probabilities/margins/filtered scores,
float64 variances, mean and validBlocks. `masks.valid` and `masks.decisions` retain
the existing compact owned byte arrays, including JSON export. Independent
`maskSurfaces.valid/decisions` expose the same grid through `readMask`; their
width/height are grid dimensions, not source dimensions. Use `data.geometry` for
64-pixel block placement. Releasing the RGB surface does not release either mask
surface. Source unload releases all three. Model unload invalidates its analysis
cache but keeps already published evidence readable.

## Memory, workers and lifetime

The analysis cache is private and keyed by immutable source and model ID/hash;
render controls do not rerun features or read source windows. Returned arrays and
stored masks are distinct from this cache and from each other. RPC transfer or
caller mutation cannot corrupt later views. Compact grids remain in RAM with
explicit admission; this is not an unbounded-cell-count claim.

Each feature worker is single-threaded with its existing fixed16MiB WASM ceiling.
Auto starts useful batches immediately at the capacity allowed by resources and
the global budget. The selector preserves source-window/prediction headroom.
Output planning favors admitted feature workers before choosing RAM or temporary
RGB storage. There is no startup calibration and no nested worker pool. Workers
stop after the task; a recognized resource failure permits one explicit scalar
retry with recorded scheduling metrics. `cpuKernel:'single'` or `'reference'`
retains the scalar path. GPU remains unqualified for these float64 features.

Display rows and source windows have bounded staging. Scores use16bytes/grid cell;
returned data plus compact raw masks use22bytes/cell; stored masks add2bytes/cell.
All arrays, copies, model state, codec/feature heaps, pages and worker allowances
participate in the same budget. Returned data is conservatively retained until
its RGB surface is released, including after RPC transfer.

The existing JSON model parser has not been rewritten: the supplied128-feature
checkpoint needs approximately1GiB budget at import, although retained inference
is much smaller. Import it before loading other large live results. A segmented
source does not remove this model-loading requirement. Process/Blob overhead is
not included in engine accounting. Cancellation closes owned temporary resources
before terminating the common worker and its children; images and model must be
explicitly reloaded.

## Validation

The unchanged3252 native render corpus passes after extracting the row renderer.
Targeted segmented tests check95 native views, native feature values and margins,
padding,8orientations, row cuts, cache/mask ownership, cancellation and refusal
before source reads. API tests check model dependency invalidation, explicit layout,
raw JSON masks and independent surface lifetimes. Pool tests check headroom,
resource-only retry and zero preflight executions.

Public recipes: `generate-large-median.py` creates a deterministic4099×3077 JPEG
and reads the existing native model; `study-segmented-median.mjs` runs the real
common worker. The checkpoint is supplied locally, never bundled. The browser
proof records complete RGB and grid hashes, useful scheduling, model/source
provenance, cached controls, temporary results, JSON, cancellation/reload and
accounted memory. Runtime-copy qualification is separate. WordPress remains B's
integration responsibility; full raster streaming export is outside this lot.

Chrome154 qualified all three12.61MP complete RGB outputs, all margins/variances,
raw masks and positive-cell counts (1562/171/98). Maximum probability error was
9.095e-13 and mean error5.690e-16, below the unchanged1e-7 bound. First requested
analysis used10workers and147source windows;317443407bytes were accounted at
worker dispatch. Observed RPC82.875s; cached views1.19s with zero source reads.
These functional timings do not establish a new speedup.

Keeping24 additional views opened an actual OPFS output; its entire native RGB
hash still matched. Maximum recorded accounting across worker lifetimes was
1058359390bytes under1GiB. The final worker's981137236-byte peak belongs to its
later model import and must not replace that higher recorded peak. JSON including
raw grid masks was255834bytes. Cancellation during useful feature work, explicit
model/source reload and a native1MP retry passed; all storage and retained/cache/
active accounting returned to zero. Unreported aborted intervals and browser/Blob
resident memory are outside these accounting measurements.

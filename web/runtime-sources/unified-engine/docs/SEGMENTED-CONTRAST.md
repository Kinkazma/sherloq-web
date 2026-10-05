# Segmented contrast indicators — M1 0.30.0-m1.14

`tampering.contrast` accepts segmented JPEG sources in the common worker.
Block sizes32/64/128/256 and all three indicators retain their native meanings.
Results have an owned RGB surface at the source's oriented resolution and compact
float32`data.values` in `row,column,indicator` order. Other data fields remain
`rows`, `cols`, `width`, `height`, `block`, `indicators` and `paddedSize`.

```js
const loaded = await engine.loadBlob({id: 'photo', blob: file});
const result = await engine.run({id: 'contrast', imageId: loaded.id,
  operation: 'tampering.contrast', params: {block: 64, mode: 2}});
const preview = await engine.readPixels({surfaceId: result.surface.id,
  revision: result.surface.revision, rect: {x: 0, y: 0, width: 512, height: 512}});
const descriptor = await engine.exportResult(result, {format: 'json'});
await engine.releaseSurface(result.surface.id);
```

These histogram/channel heuristics and their product are not calibrated editing
probabilities or an authenticity verdict. JSON includes the exact indicator grid
and padded geometry; full raster streaming export is outside this increment.

## Global geometry and exact arithmetic

The padded dimensions are `width + block - width % block` and the corresponding
height expression. A divisible dimension therefore gets a whole additional black
block. The map has yet another zero row/column, matching the historical method.
Each core block row sees its actual neighboring source/padded rows. The mixed
`[-1,0,1] × [-1,0,1]` channel derivatives are exact integers; actual padded-image
edges use reflect101. Padded blocks can still have nonzero channel derivatives
next to the source, so they are analyzed rather than silently zeroed.

Histogram error uses the existing pinned taper, binary64 DFT/FMA and normalizations.
Channel similarity keeps float32 means and divisions. Only after assembling the
complete grid does the native scale-to-byte and3×3median run. The output repeats
cells with nearest sampling and crops to the original dimensions, preserving
partial edge cells. There is no independent per-tile display or normalization.

The real large-image recipe exposed a pre-existing arithmetic defect at block256:
the port reduced all65536float32 values as one recursive sum. NumPy1.26 combines
consecutive8192-element partial sums, each with the existing128/8-lane pairwise
order. The corrected helper is used by both the contiguous and segmented paths.
On the declared12.61MP map,206 formerly differing entries now match exactly;
the previously displayed RGB happened to be identical and was insufficient proof.
The public257×257 regression reproduces two differing entries before correction
(max1.1920929e-7) and none after. See `contrast-reduction-proof.json`; no numerical
tolerance, threshold or rendering rule was changed.

## Memory, cache and lifetime

A separate arithmetic module has a fixed64MiB heap, verified as WebAssembly
minimum=maximum1024pages. It reuses pinned single-thread OpenCV core/imgproc and
DFT code. A full padded row group of `block + 2` rows plus its working data must
fit, and the compact global median grid must fit the same heap. Oversized cases
return `MEMORY_LIMIT` before reading the source. These explicit bounds remain;
this is not an unlimited-size claim.

Sources, codec heaps, row transfers, output, private maps and returned map copies
share the engine budget. Output uses RAM or owned temporary storage. Analysis is
cached by immutable source and block size; mode changes read zero source windows
when the cache survives admission. Caller mutation/RPC transfer cannot damage the
private map. Cached analyses are evictable; published outputs remain owned until
`releaseSurface` or source unload. Public cancellation closes temporary resources
before worker termination and reports `imagesCleared:true`; reload is required.

## Evidence

- 53 native indicator maps and159displays pass for both the contiguous kernel and
  segmented adapter, including the new reduction regression. Eight orientations,
  partial cells, cache mutation, cancellation/retry and refusal before reads pass.
- Chrome154 common worker, public4099×3077JPEG,256MiB: native complete RGB and
  float32 map hashes match for block32/mode0,64/mode1 and256/mode2. Four windows
  each, previous-result ownership, private cache, JSON14845bytes, cancellation,
  reload and unload pass. Maximum recorded completed-task accounting across worker
  lifetimes is206337387bytes; the final worker peak168267438bytes is smaller.
  All retained/cache/active bytes and temporary artifacts are released.
- Functional RPC observations were0.711/0.435/0.362s, with cached replay0.260s and
  zero source reads. These are not isolated speed comparisons. One CPU worker is
  used; no GPU or multiworker gain is claimed. Process/Blob overhead and unreported
  aborted intervals are excluded from the accounting figure.
- The exact copied runtime is tested separately. WordPress controls and subsequent
  PNG/TIFF integration remain with their respective owners.

Public recipes are `generate-large-echo.py` (shared synthetic JPEG),
`generate-large-contrast.py`, `generate-contrast-reduction-reference.py` and
`study-segmented-contrast.mjs`. Native sources are read only. The portable memory
idea is core block rows plus real halos and a compact global map; native adoption
and its own performance measurements are separate work.

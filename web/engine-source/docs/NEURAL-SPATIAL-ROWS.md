# Native neural projection in bounded rows — M1 .25

`createNeuralSpatialRows(factory,{budget})` projects finite float32 grids of at
most512×512 back to source rectangle dimensions, using a fixed64MiB module.
`run({input,width,height,outWidth,outHeight,nearest},{onRows,signal,...})` supplies
admitted Float32Array bands to an awaited consumer. The consumer must finish
copying/storing a band before returning; it does not own a permanent result lease.
The input stays unchanged and the caller owns the output stores.

The native coordinate formula uses the complete output rectangle dimensions,
never a band-local resize. Horizontal coefficients retain OpenCV4.11 float32
rounding and the qualified vector/scalar FMA boundary; vertical interpolation
retains the selected fused order. Identical sizes and exact2× reduction preserve
the native copy/area paths. Nearest uses native double inverse scales and floor.
`native/neural-spatial-bands.cpp` is derived from the existing qualified mode4 in
`experiments/d2prl/spatial.cpp`; the original full-memory binaries are untouched.

Output axes are bounded at131072 and every requested row must fit admission.
The heap's binary memory section has min=max1024 pages, flags1; it cannot grow.
The build disables aborting malloc so a failed allocation is an explicit refusal.
A separate staging reservation covers the borrowed grid and returned band. Band
height targets1048576 output samples but shrinks to shared-budget/heap headroom.
Cancellation is observed between real bands, including around an awaited consumer.
Errors release all staging while keeping the reusable helper until explicit dispose.
No model is loaded and no display/decision threshold is changed by projection.

## Owned numeric windows

`src/numeric-surface.js` is reused unchanged from M5 commit8d4ce76. It wraps an
oriented segmented float32/int32 store, returns owned readWindow copies, and
provides explicit disposal. Its future public name is the shared M5 `readPlane`
contract; this lot does not introduce a conflicting API. Source/plane stores can
live in RAM or OPFS/IndexedDB. No full-image numeric array is transferred to UI.
This helper will also serve the neural composed outputs in the next increment.

## Evidence and boundaries

`neural-spatial-rows.test.mjs` checks100 native D2PRL interpolation cases plus18
CMSeg512 cases, each at7/131-row cuts:236 whole-output hashes exact. The corpus
covers bilinear/nearest, edges, copy/2× reduction and awkward vector tails.
Cancellation, consumer failure, nonfinite inputs, refusal and retry pass.

`generate-large-neural-spatial.py` creates native OpenCV whole-image oracles from
synthetic448/256/512 grids. Chrome projects them into actual OPFS float32 stores
at12000×8000 and12003×8003 under128MiB. Three complete384MB-class plane hashes and
all windows match; mutating a window cannot alter the stored plane. Disposed
windows, cancellation/consumer failure, partial store cleanup and retry are
verified. Peak accounted memory is74448020bytes; browser process/Blob residency
is excluded. Functional timing and stage/storage costs are recorded in
`neural-spatial-rows-chrome[-extracted]-proof.json`; no isolated speed claim is made.
The final copied runtime uses non-aborting malloc; the earlier development proof
precedes that allocation-only build setting. Its arithmetic source is identical.

This proves projection and storage, not final detector parity. Actual raw model
grids, global zone composition, D2PRL exclusions/component masks, CMSeg/MGCF class
semantics, result ownership and streamed NPZ are the next integration work. Public
AI operations still reject segmented sources until that chain is qualified.

## Mac reuse

The same global-coordinate row projection can avoid a full temporary float plane
for each model ROI before composition. Preserve native coefficient rounding and
vector/scalar tails; an independently resized strip is not equivalent. No native
Mac file was modified and no Mac performance gain is established here.

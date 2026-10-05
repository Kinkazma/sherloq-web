# Bounded neural input preparation — M1 .24

This increment qualifies preparation from immutable RGB surfaces. It does not yet
remove the public `UNSUPPORTED_LAYOUT` guards for D2PRL or CMSeg/MGCF: their source
hashing, projection, owned result planes and streamed exports are separate work.
No model weights, inference decisions or final masks are qualified by this proof.

## Read-only input

`rgbRowSource(surface, bounds?)` returns `{width,height,readRows(y,count,{signal})}`.
Bounds are half-open rectangles in the already oriented full-resolution source.
A read returns the normal owned RGB8 window and its `release()` lease. Both
preparers release every window on success, error or cancellation, and validate
its dimensions, byte count, format and ownership hook. No Canvas or decoder is
introduced. Input bytes and scientific ROI meaning are unchanged.

D2PRL uses `preparation.runRows(input, hooks)`. CMSeg/MGCF uses
`prepare.run({...input,side:256|512}, hooks)`. The previous contiguous methods
remain usable. Row counts are scheduling controls only; defaults aim for262144
input pixels per read, and explicit `rowsPerRead` is available internally.
Progress reports completed real rows/output rows. No startup probe runs.

## Arithmetic and admission

D2PRL normalizes each RGB band into float32 NCHW with the existing byte division,
then applies the existing Torch2.8 antialiased horizontal interpolation with the
same coefficient/FMA order. Channel-major horizontal rows are copied into one
3×height×448 float32 intermediate. The original vertical pass creates the exact
448×448 tensor. There is no whole-image RGB copy or3×height×width float tensor.
For96MP the horizontal intermediate is43008000bytes; the helper admits64MiB and
actually grows to63766528bytes. The existing512MiB helper maximum remains, with
explicit admission refusal before source reads. The low-level coefficient/row
geometry guard now allows131072 per axis; allocation and safe bounded windows
remain additional constraints. The previous contiguous public limits are unchanged.

CMSeg/MGCF keeps Pillow12.2 integer coefficient order and horizontal byte rounding,
then vertical rounding and float32 byte/255 conversion. At most the vertical
filter support of already horizontally reduced rows is held. Input windows are
reused across those row calculations and released before the next read. The
256/512 native model resolution does not change, and this PIL path is deliberately
separate from D2PRL's float tensor interpolation.

All helpers use the same Budget as source/windows. A conservative borrowed-band
reservation remains in addition to provider ownership; D2PRL's actual resident
heap stays charged until helper disposal. Preparations remain sequential here.
Large tall images whose horizontal intermediate exceeds the helper admission are
explicitly refused. Efficient useful row scheduling, model execution, projection
and outputs are not implied by merely accepting a row provider.

## Evidence

`tests/neural-rows-prepare.test.mjs` compares all existing native Torch/Pillow
preparation references at7/131-row cuts (82 tensor cases), plus eight orientations
and actual rectangular crops against the qualified contiguous methods. Cancellation,
malformed providers, refusal before reads, retry, source preservation and final
zero reservations pass. Existing segmentation preparation tests also pass.

`scripts/generate-large-neural-prepare.py` runs the native Torch/Pillow transforms
on the existing public synthetic12000×8000 JPEG and the actual rectangle
[137,83,11903,7919] (11766×7836). Native Torch2.8 / torchvision and Pillow12.2 are
recorded, with encoded source and native source-code hashes. No private image,
training or inference is used; large inputs/results remain in `.build`.

`neural-rows-prepare-chrome[-extracted]-proof.json` exercises the common JPEG
loader and actual OPFS in a browser worker under256MiB. All six complete prepared
tensors (D2PRL448 and PIL256/512, each full image and crop), plus both PIL RGB
rasters, have native SHA256 identities. Peak accounted memory is176399674bytes;
this includes resident codec/helper capacity and excludes browser process/Blob
residency. Source/preparation disposal leaves zero accounted bytes and no temporary
artifacts. Both preparations cancel and retry cleanly. Functional observations are
6.47/7.29s for Torch full/crop and6.58–6.92s for Pillow; no isolated speedup or model
runtime claim is made. The copied runtime is executed separately.

## Native Mac reuse

The same row-wise normalization can avoid D2PRL's full source-sized float tensor
while retaining its horizontal intermediate and exact antialiased coefficients.
Pillow already performs native separable preparation; the browser row provider is
primarily an integration/memory technique. No native source was changed and no
Mac gain was measured. Any adoption needs the same whole-tensor identity check.

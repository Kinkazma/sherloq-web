# Admission of decoded AV1 planes

The codec uses one libavif decoder, with dav1d frame parallelism fixed to one by
`codec_dav1d.c`. Task parallelism within that frame uses the caller's admitted
thread count. Primary, gain-map and alpha image items may have separate codec
contexts. The same routines, filters and allocation owners apply at all image
sizes; the 32-bit source patch changes an admission guard, not an algorithm.

Let `D` be the exact number of native codec instances, `T` the maximum admitted dav1d
threads per item, `B` the encoded input bytes, and `Q` the preview pixels. Each
image item must use its own width, height, chroma layout and sample depth. For
one item, reproduce the upstream picture allocation:

```text
aw = ceil(width / 128) * 128
ah = ceil(height / 128) * 128
bytesPerSample = depth > 8 ? 2 : 1
ys = aw * bytesPerSample
us = chromaPresent ? ys >> horizontalSubsampling : 0
if ys % 1024 == 0: ys += 64
if chromaPresent and us % 1024 == 0: us += 64
Pitem = ys * ah + 2 * us * (ah >> verticalSubsampling) + 64
```

Sum these item sizes to obtain `P`. Gain-map scaling, if necessary, must also
cover the larger target plane allocation; an original smaller map may remain
retained by its decoder while the scaled map exists. Alpha is a monochrome item.
All products and sums in the admission calculation require checked arithmetic.

For bootstrap admission, a deliberately generous codec envelope for this
single-frame reader is:

```text
W = avifDecoderNativeCodecWorkPixels(decoder)
K = avifDecoderNativeCodecTileBudget(decoder)
codecEnvelope = 3*P + 2*W + 16 MiB + 384 KiB*D + 16 KiB*K
              + pthreadCredit + 24*width*(bandRows+4) + alphaTemporary + 6*Q + B
alphaTemporary = hasAlpha ? 4*bytesPerSample*width*(bandRows+4) : 0
pthreadCredit = multithreaded ? 2 MiB*D*T : 0
```

`D`, `W` and `K` use the same topology predicate as codec creation. Tracks
separate the primary and alpha contexts; compatible single-layer grids share
one instance; distinct operating points, allLayers or Sample Transform buffers
create separate instances exactly when libavif does. `W` sums each instance's
maximum padded128 tile area. `K` sums each instance's maximum possible AV1 tile
count, `min(64, ceil(width/64))*min(64, ceil(height/64))`. Products and sums are
checked in uint64; invalid overflow returns a value outside the safe JS integer
range and must be rejected by admission. No original image area is multiplied
by its number of grid tiles. A grid of 400 distinct 500x500 codec instances
therefore has `W=104857600`, `K=25600`, rather than 400 times its full image area.

The picture factor covers simultaneous reconstructed, super-resolution and
grain pictures. The auxiliary pixel term covers filter lines/masks, segment maps,
reference motion vectors and prediction edges. Per-instance and per-tile fixed credit covers
contexts and tile state. In this WASM build, Context+Frame+one TaskContext
occupy 318704 bytes even in ST mode, so 256 KiB alone is insufficient for a
small single-tile instance; 384 KiB includes this baseline conservatively.
The thread term includes the 1 MiB Emscripten stack and
the approximately 0.25 MiB dav1d task context, rounded conservatively. These are
admission credits, not eagerly allocated arrays.

The band term covers four RGB16 bands (base, gain, native and SDR), including
halo rows. Straight source-depth RGBA for native alpha extraction is a separately
funded, temporary band; it is released before SDR presentation. The previous
SDR output band is released before preparing the next pair. Opaque sources
allocate no extra band and keep the same RGB conversion. Preview RGB16 is
separately bounded. Scientific source storage and
its SDR display bank are separate owners; for RGB16 plus RGB8, their full memory
cost is nine bytes per source pixel. Their placement should be chosen after
observing actual decoder residency, rather than reserving the bootstrap upper
bound and forcing otherwise affordable banks to disk.

For example, a 10-bit 4:4:4 primary with an equally sized 10-bit monochrome map
has `P` close to eight bytes per padded pixel. A 10,000 by 10,000 4:4:4 picture
requests 613,515,328 bytes including upstream alignment. The checked arithmetic
qualification exercises the actual patched picture function with a simulated
allocator: it accepts this requested size, refuses a 32 MiB funded ceiling, and
refuses a 65,536 by 65,536 picture before reaching that allocator. That test does
not allocate or decode a 100 MP frame.

After AV1 decoding, committed heap bytes can replace the bootstrap envelope,
plus explicitly funded future bands, lookup tables, preview and GPU buffers.
Memory cannot shrink: a smaller subsequent growth ceiling must stay at least
as large as the already committed heap. The actual imported WebAssembly memory
maximum, and any stricter phase owner, must enforce growth before Emscripten
retries its allocator. A failed growth remains an allocation error; the codec
must never receive permission merely because its declared module maximum is
4 GiB. No allocation may exceed PTRDIFF_MAX including its alignment padding.

The bound is for the initial decoded image items. Multi-frame animation,
additional spatial layers, extra reference banks or a different conversion
plan need their corresponding retained resources in admission. Binary build
manifests and the patch identify the exact upstream implementation being used.

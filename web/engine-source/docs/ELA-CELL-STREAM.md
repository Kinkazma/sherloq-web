# ELA cell descriptor preparation from global JPEG bands

`src/ela-cell-stream.js` adds an internal streamed descriptor primitive. It feeds
the previously qualified native descriptor with exactly the same complete cell
rows, eight-pixel halos and global image coordinates. It now feeds the public segmented `ela.biomes` operation through the shared
peer/Ghost/segmentation pipeline described in SEGMENTED-ELA-BIOMES.md.

`segmentedElaCellPlane(image,quality,block,{budget,signal,onProgress})` returns
rows, cols, block, content, profiles, background, usable, metrics and release.
The arrays are owned; call `release()` when they are no longer live. The global
RGB JPEG adapter supplies consecutive bands without a complete recompressed RGB
array. Completed encoded qualities share the existing source cache.

The underlying `createElaCellRows(width,height,block,hooks)` accepts
`push(original,decoded,{y,rows})` and publishes arrays only after `finish()` has
received the whole source. `dispose()` abandons unfinished work. Input bands may
cross any cell/halo boundary; unused bottom pixels are still received but do not
create partial cells. Each native invocation retains the original row origin and halo dimensions.
The shared correction in SEGMENTED-ELA-BIOMES.md partitions magnitude arithmetic
by the native halo matrix and applies content log1p with one final float32 round. Overlapping halo bytes are
moved inside the native heap on the ordinary path. Wider bands use two explicitly
admitted JavaScript RGB rings and bounded descriptor windows with eight-pixel
halos. Gaussian/Sobel neighborhoods retain original boundary conditions; HAL
magnitude arithmetic retains the full-width halo matrix partition, including
scalar tail locations. Cell identities and subsequent peer search remain global.

The heap retains its64MiB admission. Window width is derived from the conservative
192-byte/pixel working estimate plus fixed/per-cell allowance; heap size is not
raised to admit a wide image. The ordinary full-width path is retained when it fits.
At most `min(height,block+16)` original and recompressed RGB rows are staged;
outputs reserve57 bytes/cell, capped at16384 cells as before. The heap is released
when a plane finishes; result ownership continues independently. Codec workspace,
source windows and the two encoded JPEG cache entries have separate admission.
No resizing, substitute descriptors or runtime calibration is introduced.

All27 existing native descriptor preparations match profiles, support and
background exactly; content remains within the existing3e-7 bound. Variable
bands1/32/73/7 exercise shifts within JPEG and descriptor boundaries. Additional
heights16–41 with blocks16/24/32 match the qualified contiguous implementation
exactly, including incomplete last cells. Budget/input/consumer failures and
cancellation release results and heap; retry reuses a completed JPEG.

Chrome154 processes a1600×2200 JPEG under128MiB at qualities75/80, block32.
Both3400-cell results match independent native references: profiles/background/
support exact; maximum content error2.384185791015625e-7. The source is segmented
RAM and the encoded JPEGs use OPFS. Peak accounted memory120226248 bytes.
Cancellation during descriptor calculation, cached-JPEG retry and final temporary
storage cleanup pass. This is an internal adapter test; public operation qualification is documented
separately in SEGMENTED-ELA-BIOMES.md. See ela-cell-stream-chrome-proof.json and
the generation/test scripts.

Additional native window cases12003×177/block80 and6001×209/block96 exercise
multiple window seams, partial last cells and magnitude stripe endpoints. Content,
profiles and binary support are exact on both. Background is exact on12003 width;
6001 width has maximum2.384185791015625e-7 and mean1.4100023495253697e-8 in
log1p residual units (one float32 ULP), within the authorized1e-5 target. No
descriptor substitution or support-label tolerance is used. Whole96MP downstream
peer decisions are qualified separately. Metrics expose descriptor window width,
windows per row and additional RGB ring bytes.

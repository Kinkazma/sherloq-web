# Bounded ZERO luminance, grid votes and significance

`src/zero-stream.js` supplies an internal stage for the remaining segmented ZERO
pipeline. It does not enable public `jpeg.zero` on segmented sources yet. Global
connected regions, the native mask closing, result views and progressive full
scientific exports still require integration. No partial stage is presented as
a complete forgery detector.

`segmentedZeroVotes(image,{budget,signal,onProgress,companion,storage})` returns
width/height, lossless luminance and vote stores, `grid_log10_nfa`, main_grid,
metrics and an awaited `dispose()`. Stores belong to the source temporary session
when disk-backed; dispose them before unloading the source. Luminance is uint8,
votes int8 with-1 meaning unknown. These are lossless storage encodings of native
integer values; expansion to float64/int32 gives the native arrays exactly.
Storage defaults to auto; internal consumers can explicitly request temporary
storage to reserve RAM for subsequent global stages.

The source is read in32-row RGB bands. The existing native RGB luminance function
preserves explicit FMA and rounding. Votes use64 output rows plus seven source
rows on each side. Each crop retains global top/bottom/right/left exclusions;
its grid phase is corrected by the source row offset. DCT zero counting and
tie rules use the existing native threshold filter and original-order FMA
fallback near abs(DCT)=0.5. This is not independent tile detection or a changed
frequency transform. Repeated halo calculations are included in fallback counts.

Counts and the last x-major occurrence of each grid select the same global
winner as the native x-then-y traversal, including count ties. Native log_nfa
evaluates all64 grid significances from the global dimensions and counts.
Significance values remain evidence statistics, not manipulation probabilities.

For `companion:true`, a single global JPEG99 stream explicitly uses4:4:4 sampling,
matching ZERO's native companion. Its cache namespace is distinct from the4:2:0
JPEGs used by ELA/Ghost. The existing shared codec now accepts sampling444; its
default420 behavior is unchanged. The conservative encoded capacity remains an
upper bound for both sampling modes. Companion votes are returned unmasked;
the later missing-grid stage must exclude source votes matching main_grid.

Native heap admission is ceil16MiB(8MiB+24*width*bandHeight), minimum16MiB and
maximum128MiB, with8MiB additional work allowance. Band height is at most78.
Input/output pixel planes use2 bytes/pixel in segmented RAM or temporary storage;
they are admitted separately from codec/source windows. Original dimensions must
fit the native signed integer pixel count. Larger widths or unsupported storage
fail explicitly. Vote computation now uses adaptive useful band workers in automatic CPU mode;
see ZERO-STREAM-POOL.md. The public contiguous ZERO pool is unchanged. No runtime calibration is introduced.

All76 original native cases pass, including64 phases, odd/narrow dimensions,
positive foreign/missing-grid cases and DCT threshold fallback. Original and
applicable JPEG99 luminance/votes are byte-exact after expansion; global grid
decisions match and significance stays within the established1e-10 corpus bound.
Every76 JPEG99 companion matches native RGB bytes. Sampling cache separation,
native global vote ties, memory refusal and cancellation cleanup pass. The56
existing4:2:0 native recompressions and encoded cache/error regressions pass.

Chrome154 tests the native1024² reference with both original and JPEG99 stages
under96MiB, forcing the four scalar planes to OPFS. Both expanded full arrays and
global decisions match native, main grid0. Native heap16MiB; peak accounted
memory76911616 bytes. Cancellation removes unpublished files; final memory and
storage cleanup are complete. See zero-stream-chrome-proof.json. IndexedDB,
multi-megapixel extremes, global region processing and complete segmented ZERO
exports are not qualified by this stage test.

Reproduce with tests/zero-stream.test.mjs and
scripts/test-m5-browser.mjs --zero-stream. The separately pinned39KB ZERO adapter
is built by scripts/build-zero-stream.py from retained AGPL sources and the
existing qualified vote kernel. Shared/native sources and SDK cache are read-only.

The subsequent internal global region stage is described in
[ZERO-REGION-STREAM.md](ZERO-REGION-STREAM.md). Its qualification is separate from
this vote-stage proof; public segmented rendering/exports still need connection.

Public integration is now qualified separately in [SEGMENTED-ZERO.md](SEGMENTED-ZERO.md).
Earlier descriptions of pending integration describe this primitive stage alone.

# Segmented isolated-pixel candidates — 0.21

Qualified scope and limits are recorded in QUALIFICATION-0.21.md. All existing radius1/2, threshold, neighbor range,
kind and view settings are preserved. Analysis visits raw full-resolution bands
with exact halos and excludes only the global border. The source is immutable.
Display, pixel mask and per-channel flags remain distinct owned results.

`pixels.defects` returns `surface` (RGB display), `maskSurfaces.candidates`
(mask8,0..3), `flagSurfaces.channels` (rgb-flags8,0/1/2 in RGB order), and
`tables.candidates`. `data.count` counts pixels with one or more candidates;
`data.candidateCount` counts candidate channels. Table rows have six uint32
columns: x,y,rgbChannelIndex,flag,originalValue,replacementValue. Coordinates are
in the logically oriented image, sorted y,x,BGR to match the native CSV.

Read RGB/masks with the existing APIs. `readFlags` uses the same surfaceId,
revision and rect request, returning `flags` instead of RGB `pixels`.
`readTable({tableId,revision,offset:0,length:4096})` returns owned Uint32Array data,
actual offset/length, totalRows and done. Length must be positive; EOF returns
an empty page. `readTableCsv` accepts the same range and returns exact ASCII CSV
bytes with CRLF, nextOffset and done. Only offset0 contains the header; concatenate
sequential pages without adding separators. An empty table still exports its
header. Each page has memory admission and cancellation. The consumer controls
how many output pages it holds and must budget its own download/preview buffers.

Release each raster/flag handle with releaseSurface and the table with
releaseTable; unloading the source or disposing the engine invalidates all four.
Revision/format checks reject stale or mismatched handles. JSON contains owned
handle metadata, not a silently embedded full table. Monolithic CSV export of a
segmented result explicitly directs callers to readTableCsv; the existing
contiguous CSV export is unchanged.

Classification writes RGB, raw flags and mask in raw scanline order, then creates
the exact-sized candidate table. A second bounded visit recomputes medians only
for flagged channels and maps coordinates through EXIF. Orientation1 is already
ordered. Other orientations use stable numeric radix order: two admitted RAM
buffers for smaller tables, otherwise bounded input and16 output partitions with
one temporary companion table. Keys use exact JS integer arithmetic, including
values beyond2^32, without coordinate truncation. No candidate count cap, pixel
resampling, hidden quality change or remote service is introduced. Dense tables
can still exceed RAM or the real browser storage quota and fail explicitly.

The classifier can reject a channel as soon as neither the hot nor dead inequality
can survive added neighbors, or the observed range already exceeds the limit.
Only proven-negative channels exit early; candidate medians see the whole window.
No CPU/GPU/full-pipeline or native-Mac speedup is claimed without a separate
benchmark. This adapter currently uses one compute worker.

Native complete raster/flag/mask/count/CSV fixtures and eight EXIF orientations
pass. Chrome, Firefox and WebKit pass real external sorting, injected write
failure and cancellation, plus96MP image worker API/lifecycle and complete
candidate tables/CSV. See QUALIFICATION-0.21.md for exact scope and accounting.
Physical quota exhaustion, hard process crashes, WordPress, physical devices and
other image formats/algorithms remain open. No universal parity is implied.

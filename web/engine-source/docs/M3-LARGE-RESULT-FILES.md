# Large M3 result files and OCR admission

`engine.exportResultFile(result, {format:'json', storage:'auto'}, hooks)` creates
an owned JSON file. Read it with `readExport({exportId, revision, offset, length})`
(at most 4 MiB per page), then call `releaseExport(id)`. It preserves the existing
JSON representation, including every historical overlapping group, typed arrays
as arrays, property order and numeric nulls. `exportResult` remains available for
small synchronous exports. Both direct and worker engines expose the new method.

The writer encodes bounded numeric slices and writes 256 KiB blocks. Shared
admission covers input ownership, staging, string tokens and output capacity.
Automatic storage selects RAM when the conservative capacity fits, otherwise an
owned temporary session. An explicit `maxBytes` limits actual encoded bytes;
omitting it uses the structural bound. Returned descriptors contain byte length,
SHA-256, storage metrics and source provenance. Cancellation, failed limits and
explicit release clean up owned buffers/files. This is serialization of a settled
result, not another detector pass or runtime calibration.

The new path responds to the real 96 MP BRISK historical run: detection, matching,
14,726 overlapping groups and both full-sized views completed, but its former
128 MiB conservative JSON request failed. That attempt is not an end-to-end
qualification. The same recipe is rerun with stored JSON; its eventual proof is
separate. Browser serialization checks already preserve the prior representation
through RAM and actual OPFS, including limit failure and cancellation. Six focused
Node checks cover JSON representation/chunks/lifecycle and native OCR rules.

OCR no longer rejects the global result at 65,536 boxes. Each useful Tesseract
tile asks for shared admission based on its actual TSV before parsing or copying
box objects. Filtering retains separately admitted output; global deduplication
reserves its working/output arrays before allocation. No word text is retained
in the result. Native tile dimensions, overlap, confidence, background support,
ordering and exclusion polygons are unchanged. Chrome SIMD/scalar exclusion
bounds and early/useful-work cancellation retain the existing native proof.

ALIKED + LightGlue completed the rich 12000×8000 browser recipe: 1,932 points,
3,730,692 globally constrained attention edges, 515 matches and eight groups.
Original windows, cached hidden-group view, 834,331-byte NPZ and 102,632,364-byte
PNG complete under 6 GiB, with peak accounting 3,385,057,385 bytes and zero final
retained/cache/active bytes. All 288,000,000 PNG RGB bytes equal the native drawing
of the exported NPZ. Observed 425.94 seconds includes concurrent development load;
this is not a controlled benchmark or a second native neural inference.

AKAZE files under `experiments/m3/akaze-paged-*` are development studies only.
They are not selected by the product. They preserve global scale configuration
and contrast, finite-support diffusion, and global-phase INTER_AREA row strips.
Four even/odd row-strip cases equal complete qualified native resizing exactly.
The full detector still needs global stateful suppression, descriptors, runtime
storage/admission and a real 96 MP qualification before it can replace the large
contiguous AKAZE path.

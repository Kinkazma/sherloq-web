# Automatic archive with corroboration

`exportAutomaticAnalysis(snapshot, provenance, request, hooks)` completes the
native export snapshot with method counts (`uint8`), method/search-context counts
(`uint32`) and deduplicated endpoint pairs. It uses the existing qualified native
OpenCV corroboration kernel with its canonical 256-row raster bands, original
coordinates, excluded polygons, exact D2PRL masks and one D2PRL union vote. ELA is
excluded from counts. Pair deduplication preserves member IDs and source evidence;
it does not replace raw detections or create union hulls.

The caller supplies `image_shape: [height,width,3]`, runtime `biomes`, and the
native `corroboration` record including clone-only `entries` and `excluded`.
Other native snapshot fields (configuration, results, states, errors, display,
ELA profile/settings and decoded BGR hash) pass through. Detector ndarrays must
already use `automaticSnapshotArray` with explicit native dtype/shape. Runtime
entry `pixel_mask: {width,height,data}` becomes a uint8 ndarray, and ELA `cells`
pairs become an int32 N×2 array. All scientific fields remain caller-owned and
immutable until export completes. This is an export assembly API, not a detector
or public complete-analysis task.

Request and result follow `streamAutomaticNpz`, including an independent archive
and idempotent asynchronous disposal. Input/count staging and output may live in
RAM or temporary storage. Temporary scratch has its own session, disposed before
return; the output session lives until result.dispose(). `onTemporarySession`
reports scratch IDs with purpose `automatic-export-scratch`, as well as the
normal output session, enabling the host's hard-worker cleanup. Progress phases
are `automatic-export-methods`, `automatic-export-contexts`, then `automatic-npz`.
Cancellation and errors dispose both partial scratch and output.

Memory: native kernel 64 MiB, bounded output stripes, one byte/pixel plus four
bytes/pixel for count stores, admitted entry/metadata records and export chunks.
The known kernel reservation is held while choosing RAM versus disk scratch.
No new detector inference or calibration is executed. ZIP32 and metadata limits
from AUTOMATIC-NPZ-STREAM.md remain applicable.

The actual native automatic_clones.export produces the reference: fractional
edges, out-of-frame polygons, exclusions across a 256-row boundary, overlapping
D2PRL masks with holes, ELA cells, and duplicate classical pairs. Ten arrays,
all metadata and provenance references match exactly. Node verifies source
immutability and cleanup after errors and cancellation at three stages. Chrome
uses separate real OPFS scratch/output sessions, verifies the archive, and
cancels during counts and writing. Archive 82,374 bytes; peak accounted 69,259,776
under 96 MiB including test buffers; final budget zero, storage inventory
unchanged. See automatic-export-chrome-proof.json. This postprocessing proof
does not resolve the known M2 network-to-polygon mismatch.

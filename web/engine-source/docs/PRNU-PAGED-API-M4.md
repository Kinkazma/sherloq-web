# PRNU encoded containers and lifetimes

`createWorkerEngine.loadPrnuDatabase({id, blob, fingerprintStorage:'temporary'})`
reads an original immutable HDF5 Blob through bounded OPFS staging. Existing
`bytes:Uint8Array` calls remain supported. Returned metadata includes
`metrics.encodedLayout`, `originalBlobBytes` and explicit browser-managed Blob
residency; this is not reported as zero physical RAM. The hash covers the exact
original file, including legacy metadata.

`buildPrnuDatabase({...input, outputLayout:'pages'})` writes native schema HDF5
through the paged native driver; `auto` (default) selects it when the encoded
resident estimate does not fit. Explicit `bytes` preserves the legacy return
path. Training, exclusion, camera grouping and cropped incremental means are
unchanged. No synthetic work or calibration is run.

For all database layouts, call `createPrnuDatabaseExport(id)`, then
`readExport({exportId:descriptor.id, revision:1, offset, length})` (maximum4MiB),
then `releaseExport(id)`. Descriptor format is `hdf5`, MIME
`application/x-hdf5`, with full byteLength/SHA256. The original imported encoded
file is preserved, not rewritten as a fabricated training snapshot. Exports own
independent leases and remain valid after database unload; releasing one export
does not invalidate another. `exportPrnuDatabase(id)` remains the synchronous
small bytes API and explicitly directs paged/Blob users to the streaming API.

Worker sessions, including newly created encoded archives, are registered for
cancellation and disposal. Hash/input/output loops are bounded and cancellable.
The common raster/scientific export registry is reused: its `adopt` accepts
optional MIME/format, defaulting to the previous NPZ values. Integration M5 must
merge this into its existing registry/readExport/releaseExport, never instantiate
another registry beside the one already in its engine.

Chrome API proof `prnu-pages-api-proof.json`: legacy bytes and Blob imports,
original SHA after unload, construction from five training JPEGs/two cameras,
two independently released export leases, native h5wasm metadata reread and final
accounted memory0. Peak124619177B/256MiB. The large low-level PRNU journey's first
attempt had correct full residual/ranking but incorrectly tried to rewrite a
legacy base; its failure is retained. The corrected96MP identification journey is complete
and independently verified in `prnu-96mp-proof.json`. This small API proof alone
is not the large-source qualification.

Large construction evidence: `prnu-build-96mp-proof.json` covers two distinct
12000×8000 JPEGs, complete native running mean, paged gzip4 HDF5, source/database
release and independent full h5py comparison. All values and training identities
are exact; see `M4-96MP-COVERAGE.md` for the complete path.

Import/write progress includes `prnu-hdf5-read` and `prnu-hdf5-write` with
`completed`, `total` (fingerprint values) and `camera`. Events are emitted about
every100ms and at completion, so the UI can display actual HDF5 work after the
FFT/residual stages. `prnu-hdf5-hash` remains a separate encoded hashing phase.
The callback does not change the HDF5 data or ownership contract. The public
worker API test checks both completed progress phases and delayed export leases.

M5 common integration forwards HDF5 progress through byte imports and byte
exports as well as Blob imports and paged output. The public Chrome API recipe
asserts completion in each of these four paths, retains independent archive
leases across unload, and ends with no retained/cache/active ownership. The
96MP construction/identification scientific proofs are reused unchanged.

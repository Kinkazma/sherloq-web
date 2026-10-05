# PRNU encoded HDF5 on temporary storage

`src/prnu-hdf5-pages.js` exposes `readPrnuHdf5Blob(blob, {budget, signal,
onProgress, storage})` and `writePrnuHdf5Pages(database, {budget, signal,
onProgress})` in a dedicated worker. Input original bytes are copied in bounded
pages to OPFS. Native HDF5 reads that random-access file directly, and fingerprints
are ingested into owned stores. Dispose the returned database asynchronously.

The writer returns `{store, byteLength, sha256, mime, metrics, release}`. Keep the
database alive during assembly; the completed encoded archive is independent.
Read bounded pages through `store.readInto` and await `release()` after export.
The encoded file never becomes a full JS byte array or MEMFS file. The ordinary
native HDF5 driver, schema, camera attributes, float64 data, gzip4 and chunk layout
are retained. Transfers align with the native 128×128 chunk grid to avoid repeated
compression of partially filled rows. No image resizing or residual approximation.

OPFS is required for encoded random access because this HDF5 build is synchronous.
An IndexedDB Promise cannot masquerade as a completed file read; it is rejected.
Capacity is conservatively admitted as twice the raw float64 payload plus metadata
and 32 MiB, on temporary storage; real quota/I/O errors remain errors. The returned
length is the actual encoded EOF, not this capacity. The input/output stores are
cleaned on failure. Cancellation is checked at useful HDF5 I/O and chunk boundaries.

The old Uint8Array read/write interfaces remain available. `readPrnuDatabase` also
accepts a synchronous store, and `writePrnuDatabase` accepts an `encodedStore` for
callers managing their own capacity. These low-level stores are borrowed.
The current createEngine legacy database methods still return full `bytes`;
consumers must use this paged API for large containers until M5 reconciles the
shared runtime/worker export handles. This is an explicit integration contract,
not a claim that legacy byte exports became unlimited.

Validation: four targeted Node tests cover old and stored HDF5, crop/NCC and
lifetimes. Chrome OPFS under128MiB imports native two-camera data and writes a
53327-byte snapshot (accounted peak71696384B, native heap19333120B). Independent
h5py verifies every float64 fingerprint and camera attribute value (JSON spacing excluded) after the input
database is released. Proof `prnu-hdf5-pages-proof.json`. Large-source residual,
training and complete96MP export qualification remains separate and pending.

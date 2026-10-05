# Segmented byte storage — shared internal primitive

Version0.14 uses this primitive for qualified JPEG sources and histogram analysis;
see SEGMENTED-SOURCES.md. It does not by itself qualify arbitrary-size photographs.

`createSegmentedBytes` owns a logical byte array split into bounded RAM chunks or
job-scoped local storage. Auto keeps data in RAM when the shared budget admits
both retained bytes and staging. Otherwise it requires a temporary session.
Reads/writes must be awaited: OPFS is synchronous inside a dedicated worker,
whereas IndexedDB is asynchronous. Caller-provided arrays must remain valid and
unchanged until their operation resolves, and their memory belongs to the caller's
budget. `visit` lends a reusable buffer only until the visitor returns; retain a
copy only under a separate reservation. Blob staging is bounded and never changes
the immutable original. Partial writes are unpublished work until the owning
transaction commits; a failed/cancelled owner must dispose the partial store.

OPFS uses one owned job directory; IndexedDB uses one owned job database. If OPFS
session creation fails as unavailable/I/O, auto tries IndexedDB before any image
computation and reports the failed backend/reason. Explicit selection never
switches backend. Quota errors are resource failures. A quota estimate is not a
reservation. Since0.15, free-space estimates are advisory because observed usage
can lag deleted jobs; explicit allowance and total origin quota bound logical
arrays, and real writes still enforce the browser quota. See SEGMENTED-RESULTS.md.
IndexedDB serializes its I/O and charges page reads/structured-clone staging under
the same RAM budget. Its backing medium is browser-managed and can be RAM in a
private context, so these tests do not prove disk/RSS behavior.

Disposal closes handles and removes only the owned directory/database. The caller
keeps the returned session ID/backend so it can remove that job after hard worker
termination. Large OPFS locks may outlive a forced termination; version0.14 first
closes storage cooperatively and reports failed watchdog cleanup explicitly.
App-crash orphan recovery and a shared multi-engine storage broker
remain open. Never remove an entire origin or unrelated session to recover space.

Proofs: `temporary-storage-{chrome,firefox,webkit}-proof.json`. 64MiB+113bytes are
written/read exactly through 1MiB+17 staging, including random segment seams,
logical quota admission, cancellation and hard-worker termination cleanup.
Chrome154/Firefox155 select OPFS; WebKit26.6 fails OPFS opening with UnknownError
and successfully uses IndexedDB. Forced IndexedDB also passes all three.
Accounted staging peaks are 1,048,593bytes(OPFS) and 3,145,745bytes(IndexedDB),
not process RSS. Times come from concurrent functional tests, not benchmarks.

Platform references: [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system),
[IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
and [asynchronous IndexedDB use](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB).

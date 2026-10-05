# Clone panel API — 0.33.1-clone-panel.1

Increment based on the immutable integration.33 commit
588b6d137fcf940e0bf5703aeb650b53a570e03d (full commit identity is recorded by Git).

Adds `tampering.copyMove.dense` to createEngine/run, full and segmented source
capabilities. The six existing DENSE_PROFILES call DenseCopyEngine with the
shared budget and aggressive worker profile. Geometry and rendering reuse the
existing native-method adapters. No image resizing or runtime probe is added.
The public `params.profile` is the exact native name; patch/iterations/texture,
flip/auto/compact, regions/guides/compare and geometric settings are validated.

Completed fields stay in the worker. Surface ownership and a source cache share
references; only compact point/pair evidence is copied before public transport,
which transfers every returned typed array. Changing presentation reuses the
verified result. A different operation retires this cache, while a published
surface still owns what its NPZ export needs. Unload/dispose retire all owners.
PNG uses the existing surface export. NPZ is streamed through exportSurface,
readExport and releaseExport; schema sherloq.clone-dense/1 includes complete
field arrays (targets, distances, consistency, geometry errors), native point,
pair, group, colour and parameter arrays. This is the browser array-reference
archive format, not a claim of byte-identical desktop ZIP formatting.

The reported FEATURE_EXTRACTION_FAILED / "Feature extraction memory allocation
failed" is emitted only after sparse_extract returns -4. The C++ implementation
maps std::bad_alloc and OpenCV StsNoMem to this status. Previously the worker
lost that identity and the pool did not grow the heap on MEMORY_ALLOCATION.
The corrected boundary emits a WASM allocation error with current/admitted
heap, family, dimensions, point limit and native status. Heap admission includes
fixed overhead; recovery can grow the heap within the shared budget, preserve
completed regions, or switch unfinished SIFT/AKAZE work to the existing bounded
implementation. Every replay changes the allocation or execution plan. Parallel
siblings settle before their memory reservations are returned. Ordinary native
errors are not reclassified as resource failures.

The original report does not identify the selected family, image size, actual
heap extent or physical memory pressure. It establishes the native memory-refusal
path, not which system limit caused that particular allocation to fail.

Validation uses fault-injected workers and contract tests, not a new image run:
all six real profile validators/pass plans, compact transport without detaching
archive arrays, view reuse, full NPZ dtype/value checks, final ownership cleanup,
failed publication, native allocation serialization, heap growth, conservation
of completed regions and bounded fallback. Manual image acceptance remains with
the user. The long-running 96 MP process is not inspected or changed.

# Nested automatic-analysis scientific archives

`automaticSnapshotArray(source, {shape, descr})` marks a native ndarray inside a
snapshot. `source` is a matching typed array or a little-endian segmented byte
store with `byteLength/readInto`. Shapes are mandatory, including `[]` for a
scalar. Supported native dtypes: bool, signed/unsigned 8/16/32/64-bit integers,
float32 and float64. A byte store also requires an explicit dtype. No matrix
shape or bool/integer distinction is inferred from a flattened field.

`streamAutomaticNpz(snapshot, provenance, request, hooks)` walks plain records
and lists using the native `root_<key>_<index>` names and `{array: name}` metadata
references. All native arrays must be wrapped explicitly; raw typed arrays,
functions, undefined, cyclic records and ambiguous flattened path collisions
fail instead of silently losing scientific data. Snapshot construction and
field normalization remain the composition caller's responsibility. In
particular, this primitive does not run detectors, add count maps, or claim the
public automatic operation is connected.

Python-compatible metadata preserves NaN, Infinity, -Infinity, negative zero,
and BigInt as an exact JSON integer token. These are Python JSON conventions,
not strict RFC JSON; load with the same Python json.loads used by the native
consumer. Metadata strings remain NumPy Unicode scalars, without pickle.
Browser provenance is a separate `browser_provenance_json` member. Numeric
payloads and decoded metadata match native automatic_clones.export; the archive
uses ZIP stored members rather than native deflate, so ZIP bytes/size differ.

Request supports storage auto/memory/temporary, maxBytes, temporarySessionId.
The export owns a fresh output session when temporary storage is selected.
`result.dispose()` idempotently disposes the archive and that session. Source
arrays/stores belong to the caller and must remain immutable and alive until
export settles; after that, the archive survives their disposal. Signal and
progress (`automatic-npz`, array, fraction) apply during each 65,536-scalar chunk.
All failed/aborted exports clean their output and reservations.

ZIP32 limits remain explicit: at most 65,533 scientific arrays plus two metadata
members, output <= 4 GiB minus one, member filename <= 65,535 UTF-8 bytes. Unicode
filenames have the ZIP UTF-8 flag. Metadata nesting is limited to 256, ndarray
rank to 32. Metadata/planning stays in admitted RAM; scientific data and output
can use OPFS/IndexedDB. No compression or unbounded-archive claim is made.

Validation: actual native export fixture covers 14 nested arrays, all supported
dtypes, empty and scalar arrays, multibyte names, integer precision and special
floats. Node compares types/shapes/byte hashes and metadata exactly, validates
failure cleanup, and keeps existing energy archive byte parity. NumPy itself
loads the generated archive with allow_pickle=False and verifies every array.
Chrome uses actual OPFS source/output, disposes the source before rereading the
archive, verifies native data, and cancels another output mid-write. Output
2,227,059 bytes; peak accounted 19,008,260 under 32 MiB including proof buffers;
final budget zero and unchanged temporary-storage inventory. See
`automatic-npz-chrome-proof.json`.

# Exact large temporary arrays

The shared OPFS backend stores each logical array in physical files of at most1GiB. Reads and writes split at physical seams while keeping original safe-integer offsets, implicit zeros, byte length, ownership and quota accounting. Small arrays retain one file. Session snapshots expose logical arrays and physical file counts. Allocation verifies the actual file length; every read/write count must be positive and no larger than its requested chunk. Cleanup covers all shards and partial allocation failures.

This repairs a real Chrome154.0.8037.58 private-context failure: after truncating a3,840,012,345-byte file and writing16bytes at its start, getSize reported only16; writing at its end reported4,294,967,288 bytes for a16-byte request, followed by EOF. One1GiB file worked. The previous backend accepted that impossible unsigned count. The new tests read/write across every1GiB seam and beyond4GiB in logical arrays of3,840,012,345 and4,294,968,320 bytes, with zero holes and complete cleanup. These are sparse storage tests, not full scientific computation proofs. See opfs-large-array-proof.json.

Node failure tests cover short I/O, rejected invalid counts, truncated allocation, failure during the third shard, restored admission and idempotent disposal. Existing actual OPFS/IndexedDB64MiB lifecycle, cancellation, worker-termination and quota tests remain passing.

The same private context refused a384MB allocation when about4.13GB was reserved, despite its reported10GiB quota. Such an I/O failure remains explicit; this change does not promise unlimited browser-managed storage. Full96MP science/export tests use fresh normal Chrome profiles and remove them afterwards. Blob residency and private-mode OPFS backing are browser-managed and outside the engine's accounted working memory.

The complete positive96MP ZERO calculation now passes through this backend:3,840,009,430-byte NPZ, every scientific array read and verified, full archive hash read again after source unload, and all temporary jobs removed. This closes the real large-export case that exposed the failure; it is separate from the sparse >4GiB header/storage checks.

# Scientific NPZ scheduling — M1.29

The scientific NPZ writer now yields to control messages after about8ms of useful
work rather than unconditionally between every small block. The final SHA256
pass uses the same policy and reuses the already admitted scratch buffer. Array
order, scalar chunks65536, hash chunks65536bytes, values, dtype, ZIP headers/CRC,
metadata encoding and output ownership are unchanged. No extra workers or
unbounded preload are introduced; the generic segmented-store visitor is untouched.

## Isolated measurements

The development recipe reuses all six12000×8000 D2PRL CPU output planes already
qualified against native. Every input file is fully hashed before timing. Source
planes reside inRAM; the output is forced toOPFS. This is an export-only study,
not another inference benchmark. All strategies use the same2GiB shared budget,
scientific arrays and metadata, in one sequential Chrome154 worker session.

| Change | Complete NPZ preparation |
| --- | ---: |
| M1.28 reference |236.749s|
| Cooperative writing only; old hash traversal retained |175.780s|
| Cooperative writing and hash traversal |25.400s|

The observed final ratio is9.32×. All three1,440,003,200-byte files have exactly
the sameSHA256 `fb3efc3dcc5989ff7416eb67a3fe21ccb6940e6721779d334a20998433e00ddb`.
Final assembly/CRC/write/flush took10.670s and hash14.623s; the small remainder
is metadata/admission/storage setup. New `assemblyMs` and `hashMs` export metrics
separate these stages. A progress phase ending in `-hash` identifies the final
checksum pass. No original scientific metadata is changed by these metrics.

Source loading10.533s and saving1374 pages to the private test file65.325s are
outside NPZ preparation. That private HTTP test sink is not a browser download
or WordPress paint measurement. This is one observation per strategy in fixed
order, with local assets and filesystem caches; it does not predict every device
or establish a9.32× end-to-end analysis gain. The earlier real96MP source→D2PRL
proof and its237.553s export observation remain unchanged.

Peak accounted memory is unchanged1,444,194,304bytes, below2GiB; this peak includes
loading the six scientific stores. All stores and temporary artifacts are gone
after release. Both writing and hashing accept real queued worker cancellation
messages, clean their partial exports and preserve source stores. Timings for
that cleanup are recorded in the detailed report rather than asserted as a
universal responsiveness bound.

## Evidence and delivery

- `neural-export-throughput-proof.json`: three isolated strategies, exact file
  identities, stage times, actual cancellation and zero remainingOPFS artifacts.
- `neural-export-throughput-npz-proof.json`: independent NumPy read with
  `allow_pickle=False`, ZIPCRC, shapes/dtypes/metadata and all six native plane
  hashes. The public synthetic original image was used for the prior inference.
- `scientific-npz-scheduling.test.mjs`: full byte equality to the existing
  contiguous writer across chunk boundaries, float64/int32 and long Unicode.
  Existing neural tests cover float32/uint8, window ownership and failure cleanup.
- Final runtime copy: a real segmentation API recipe exercises this exporter
  and its scientific readback. `neural-export-runtime-binding.json` verifies that
  the copied exporter/storage/hash files are exactly the ones used by the96MP
  study; that long study is not repeated merely to copy identical files.

Reproduce with `node scripts/study-neural-export-throughput.mjs`, after materializing
the M1.28 runtime at `.build/segmentation-runtime-0.30.0-m1.28` and generating the
existing96MP D2PRL native references. The baseline copy is manifest-verified;
`experiments/exports/scientific-npz-write-cooperative.js` is an offline single-change
reference, not runtime code. Each report records executed source hashes. NumPy
readback uses `scripts/check-neural-export-throughput.py`; an optional full copied export study uses
`--strategy=cooperative --runtime-root=<copy>` and readback `--extracted`.
The delivered copy instead reuses the96MP binding and tests the actual MGCF-ST
common-worker path with its own tagged extracted NPZ proof.

This helper is proposed from M1 for the coordinator's shared export-manager merge;
no other worktree was modified. Its typed-stream contract remains compatible
with the M5 scientific exporter. Browser timer batching has no directly measured
native Mac gain: no native application change is proposed on this evidence alone.
TNT/VIG, other device qualification, WordPress integration and the wider mission
remain open.

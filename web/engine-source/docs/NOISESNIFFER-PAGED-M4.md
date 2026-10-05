# Global stored Noisesniffer selection

When the resident selection workspace does not fit the shared budget,
`segmentedNoisesnifferSelection` now uses externally stored float64 keys and
uint32 IDs. The NumPy1.26.4 unstable introsort/heapsort traversal, tie behavior,
NaN ordering and bin boundaries are preserved. Keys move with IDs, so partition
scans do not repeatedly gather scattered original means. There is no per-tile
ranking, histogram approximation or truncation of candidates.

Per-bin variance and standard-deviation sorting remain the native algorithm.
Flags use exact two-bit packed membership when admitted, otherwise a bounded16MiB dirty-page cache; source blocks use4MiB of original RGB
pages when the source record exposes its store (including all eight orientations).
For byte8×8 blocks, global integer sums/squares give exactly the native float64
standard deviation (all intermediate fractions are exactly representable). The
complete std map avoids repeated byte-level sparse block reads. Other block
sizes retain the existing NumPy reduction order. Full-source row windows
remain a compatibility path for borrowed surfaces without a backing store.
Cell counts and ordered global region growth are unchanged. Intermediate keys
and IDs are disposed after selection; output stores remain owned by the result.

`noisesnifferPagedSelectionWorkspace` replaces the old global-array admission for
large inputs. It depends on bin size, source axes and cell-grid counts, not full
pixel arrays. The native sort cache is admitted from remaining RAM and reports
actual read/write counts. The ordinary in-memory path remains for fitting jobs.
No calibration or synthetic preflight is executed on user data.

The existing paged Noisesniffer exporter consumes the M5 version at `f18fe7d`,
including the common scientific ZIP64 helper. Its small archives retain their
previous bytes. No second ZIP64 implementation is introduced.

Validation: external sort matches the resident NumPy port for eight cases,
including NaNs, ties and adversarial partitions, with a one-page512-byte cache.
Eight Noisesniffer selections (patch3/8, ties and empty constant) preserve full
ordered selected/low lists, flags and cell counts. Chrome OPFS additionally checks
native reference hashes for four cases. Existing small NPZ byte parity passes.
The complete 12000×8000 browser path is also qualified under256MiB: all ordered
lists, flags, counts and distribution are native-exact; two complete PNGs and
the950932720-byte NPZ pass independent full reads after source release. The
rich image has no native suspicious region; the smaller corpus covers positive
growth cases. Peak accounted memory260953616B, final0, seven useful statistics
workers, cached view changes and zero preflight executions. See
`noisesniffer-96mp-proof.json` and `M4-96MP-COVERAGE.md` for the scope and timing.

The packed memberships are expanded to the unchanged full uint8 flag plane on
output. A96million-pixel membership test verifies every output byte, repeated
marks, fallback admission and cancellation. The native selection corpus still
matches all ordered lists/flags/counts. DCT strip admission uses real core and
halo workspaces; a12000pixel-wide strip produces identical records with1 or6
workers under256MiB. Global NumPy sorting now bypasses per-page WASM suspension
for synchronous OPFS/RAM, while retaining real asynchronous I/O and cooperative
yields. These optimizations do not change bin ordering or region growth.

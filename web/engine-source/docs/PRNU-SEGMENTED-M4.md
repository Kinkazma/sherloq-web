# PRNU global residual on segmented sources

`noise.prnu` now accepts a JPEG loaded with `layout:'segmented'`. Keep the usual
`params:{databaseId}` and import a database through `loadPrnuDatabase`. Results
retain the existing scores, exact decimal formatting, ranking, experimental
threshold, exclusions and export semantics. A high score is not calibrated camera
identification. Training membership is rejected before extracting a residual.

The residual uses native RGB grayscale, binary64 normalization, the same SciPy
cost decision between direct correlation and FFT, the same global Wiener noise
mean, border crop and finite-value policy. FFT uses the pinned pocketfft kernel,
reference seeds and exact FMA implementation already qualified in the contiguous
engine. Real rows and complex columns span whole padded axes. The 3x3 kernel is
transformed globally too; no independent tile Fourier approximation is used.
Inverse scaling and NumPy8192 reduction boundaries remain global. RAM/OPFS/IDB
stores hold input, statistics and packed half spectra under the shared Budget.

Independent complete axes execute in CPU workers immediately when memory admits
them. Their heaps, seeds and transfer staging are admitted together. Scheduling
adapts from completed useful work; there is no benchmark, canary or calibration.
Under smaller budgets the same calculations run in the owner worker. Two complete
axes plus seed/strip workspace must fit. The seed qualification range remains
2,097,152 per padded axis. No GPU FFT parity is claimed.

The source retains one residual across database changes and repeated rankings.
`metrics.residualCached` and `metrics.cache.residual` expose reuse. Progress phases
include `prnu-gray`, `prnu-direct` or `prnu-fft-*`, `prnu-statistics`, `prnu-noise`,
`prnu-residual` and `prnu-matching`. Cancellation checks occur between strips and
I/O; sibling workers terminate together on failure. Failed extraction removes all
intermediate planes. Unloading the query releases its residual before deleting
its temporary session; unloading a database does not remove that image cache.

Validation: thirty native valid inputs through1024x1024 preserve every residual
binary64 bit, global noise power and method choice. Complete-axis convolution also
matches the existing full FFT on odd/even and narrow inputs. Seven cancellation
phases leave no temporary planes/reservations. Chrome1600x1100 with512MiB uses
four workers, matches the native full-residual SHA256/noise and two camera scores,
reuses the residual, exports provenance and leaves no temporary files. The first
public calculation took3.60s and a cached ranking1.8ms in this development run;
these are not universal speed claims. See `prnu-stream-browser-proof.json`.

The HDF5 file itself remains admitted in memory; its fingerprints can already be
stored progressively as described in `PRNU-STORAGE-M4.md`. Progressive training
snapshot construction is now delivered separately in `PRNU-STORAGE-M4.md`.
Common files for coordinator merge: index routing/capabilities/heap accounting,
source cleanup, Float64 complex planes, configurable strip-worker admission and
runtime manifest. B retains database management and UI presentation.

The public128MiB path also matches both scores and global noise exactly while
using OPFS, with106.54MB peak accounted memory and complete cleanup. It selected
one worker under shared admission. See `prnu-stream-lowmem-browser-proof.json`.

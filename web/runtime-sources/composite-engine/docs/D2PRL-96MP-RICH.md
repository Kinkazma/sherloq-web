# D2PRL on a rich 96 MP source — CPU and GPU qualified

This recipe closes the positive-load gap in the earlier D2PRL large-image
evidence. The historical M1.27 CPU noise-source proof had an empty final mask.
It remains valid for that case; it does not establish positive-load coverage.
The new browser CPU and GPU paths, with their complete NPZ readbacks, pass.
Their six full plane hashes match in both views. This is a new source/memory
qualification of the unchanged M1.37 D2PRL engine, not a new algorithm or speedup.

The public generator builds a 12000×8000 source from the existing synthetic
D2PRL RGB fixture, with seeded noise and JPEG quality 93. Original bytes and
decoded pixels are identified separately:

- Original JPEG: 22,835,139 bytes, SHA256
  `03c0b3127e021f2b8f88cbe044545e0de2127fcdae8a62cd36182821180f2ccb`.
- Decoded RGB: SHA256
  `f36a71d7001d402be0f2615fdda70a01964b78f723660ee312cb4986d227a17b`.
- Native reference manifest: SHA256
  `bc311beb64509716f917dabfe3fb0f0ff603c8efef747ff97fadde7732dcb6a1`.

The native reference uses two large regions, `[392,473,6979,5820]` and
`[3432,1871,11447,7671]`, plus the full `[0,0,12000,8000]` envelope. Bounds are
half-open source coordinates. Each pass preserves the model's native 448 input,
40 iterations and seed 22. Its union mask has 68,160,948 positive source pixels.
The fixed network input is part of the method; the source and output planes
retain their full dimensions. No search is replaced by independent tiny tiles.

The browser recipe runs the immutable M1.37 runtime under a shared 3 GiB budget,
explicit CPU followed by explicit WebGPU, with the same checkpoint and source.
It compares every value in all six source-coordinate planes: probability,
union mask, analyzed mask, candidates, target role and source role. The target
and source roles are residual-sign decisions, not class probabilities. Binary
and role decisions must be exact; continuous probability error is reported.

A second view changes the component minimum from 500 to 17 using cached native
grids, with zero new inference. The first result must remain owned and readable.
The complete second result is exported to paged NPZ on temporary storage. After
source, model and result release, the export is read in full and independently
checked with NumPy: ZIP CRC, archive SHA, names, dimensions, types, provenance
and every native plane value. Final budget ownership must return to zero.

## Actual CPU result

The [copied browser run](neural-segmented-d2prl-large-rich-cpu-m1-37-extracted-proof.json)
and [independent NumPy readback](neural-segmented-d2prl-large-rich-cpu-m1-37-extracted-npz-proof.json)
pass. All six full planes are native-exact in both views, including the role
decisions. The initial and refiltered masks have 68,160,948 and 71,635,170 positive
pixels. Native-grid residual differences are not relabelled as exact tensors:
the three raw grids have maximum errors 5.662442e-7, 4.470348e-7 and 5.960464e-7,
with no change to the final source-coordinate decisions on this case.

Load takes 2.3307 s; the three-inference analysis takes 2667.0132 s, including
15.9407 s of projection. Cached refilter takes 23.2644 s with zero inference;
NPZ preparation takes 61.7783 s. These shared-load functional observations are
not a speed comparison. The accounted peak is 3,221,007,456 bytes under the
3,221,225,472-byte budget, with all owned reservations zero after disposal.
The source and first result reside in RAM. The second result keeps its map in
RAM and uses temporary storage for the other five planes; the export uses OPFS.

The complete NPZ is 1,440,016,372 bytes, SHA256
`dd7201c71b22f735fb754c5c59c2227170feef505a420d12840b05bf8c3e9346`.
Its six scientific arrays and two metadata entries are independently checked.
The executed immutable M1.37 runtime manifest SHA256 is
`dea349b27266ccd732a52f4183384892110b97dee555c54eaec128ebeae31236`.

## Actual GPU/hybrid result

The [GPU browser run](neural-segmented-d2prl-large-rich-webgpu-m1-37-extracted-proof.json)
and [independent NPZ readback](neural-segmented-d2prl-large-rich-webgpu-m1-37-extracted-npz-proof.json)
also pass on the same immutable runtime. Convolutions use WebGPU, PatchMatch
uses WASM workers and residual roles use ONNX/WASM. Every final plane SHA is
identical to CPU and native, with the same raw-grid error maxima reported above.

Load takes 1.8078 s; analysis takes 1645.6659 s including 14.9750 s projection;
cached refilter takes 36.2416 s with zero inference; NPZ preparation takes
109.4523 s. Storage follows the same RAM/temporary split as CPU. The accounted
peak is 3,201,593,312 bytes under 3 GiB; final ownership is zero. The slower
refilter/export observations are retained, rather than claiming every GPU stage
is faster. Both runs used the shared workstation and were not isolated timing
comparisons.

The GPU archive is 1,440,016,304 bytes, SHA256
`074728b0efb1e02b3885a79c95baf13d48b69e22de8fddbaf5c10a51ca34ea5b`.
Archive identity differs because execution metadata differs; all six scientific
planes are identical. The [coverage table](NEURAL-96MP-COVERAGE.md) records these
two positive paths separately from the historical empty-mask run.

Functional times on this shared workstation are not isolated CPU/GPU speed
measurements. The recipe's `exportMs` times archive preparation in temporary
storage; the later full readback and independent verification are correctness
checks, not included in that export timer. The accounted peak covers admitted memory capacities, excluding
unmeasured browser/driver overhead. This engine recipe does not establish
WordPress cohabitation or qualification on additional physical devices.

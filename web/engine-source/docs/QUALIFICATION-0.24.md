# Qualification 0.24 — Fourier evidence and explicit CFA rejection

Final source regression: **145/145 tests pass**, zero failures/skips,
258177.744459ms with concurrency2. No native application or WordPress files were
changed. The50-panel mission remains unfinished.

The standalone `tampering.resampling.fourier` operation is available. It preserves
original grayscale decoding, global normalization before ROI, central even-square
geometry, NumPy FFT ordering, optional pyrUp/center, both windows/highpasses,
gamma/rescale and the real native gray byte LUT. It produces frequency-grid data,
not a probability map or authenticity decision. The EM algorithm stays absent.
Full control definitions, limits and reproduction are in [RESAMPLING.md](RESAMPLING.md).

Chrome154, Firefox155 and WebKit26.6 validate16 bit-exact arithmetic primitives,
992 small Fourier outputs/32 expected errors,180 original-file pipelines and
three1MP full-array cases each. All declared RGB previews match the native bytes.
The scalar pipeline has a measured scaled tolerance1e-8, not bit identity; first
argmax can move between near-equal peaks. The serial and parallel presentation
paths produce identical binary64 values and bytes in their own browser runtime.
Cache dependencies, owned results, original-byte provenance, JSON, cancellation,
reload, shared-budget refusal and resource-reduced worker pools pass.

Three isolated alternating Chrome trials measure2048² presentation275/77.9ms
(3.53×) serial/ten workers, complete example chain709.1/499.4ms(1.42×), calculation
RPC625.3/422.4ms(1.48×), and cached gamma change282.9/85.1ms(3.32×). Output512²
workers lose and remain unselected; the automatic threshold is1MP output.
Peak accounted memory1012564163/1058698703 bytes stays under1GiB; this is not RSS.
No runtime calibration, preload, persisted performance profile or hidden input
transformation is used. FFT/GPU parallelization itself remains unqualified.

The Adaptive CFA study verifies three existing checkpoints and their executable
ONNX conversions, then rejects both WASM and WebGPU parity after changed local
and global decisions. [CFA-CONVERSION-STUDY.md](CFA-CONVERSION-STUDY.md) and the
aggregate JSON preserve the evidence. No CFA operation, ONNX runtime assets,
converted weights, training or remote fallback enters this release. The three
historically missing weight groups remain blocked.

The registry now describes35 partial panels and15 unavailable panels. Partial
does not mean every variant, export or UI integration is finished. There are34
callable operations. Source segmentation, the complete EM/composite workflow,
physical Safari/mobile/non-Apple qualification and WordPress integration of this
operation remain open. New FFT sources and NumPy/OpenCV/musl/Matplotlib notices
are retained, with a byte-identical local WASM rebuild verified.

The extracted immutable runtime passes all34 callable operations and the complete
resampling small/original-image/large-parallel Chrome recipe. All151 runtime
file hashes match. It repeats992 kernel outputs,180 original-file pipelines,
three1MP arrays, real worker cancellation and resource-reduced pool checks.
See `extracted-runtime-0.24-proof.json`. The generic smoke uses an explicitly
hand-authored median model solely for API plumbing; actual model qualification
remains in0.22/0.23 evidence. Runtime archive7988220 bytes, SHA256
`a4b923ffc1775318ede1bf47d0d7b253fb9ae3b10c842284e387e6e7993afa6d`.

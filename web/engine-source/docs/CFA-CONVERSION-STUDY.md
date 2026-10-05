# Adaptive CFA conversion study — detector still unavailable

All three existing checkpoints were read back against their recorded SHA256.
Their unchanged native networks exported to ONNX opset18 and passed the ONNX
checker. Each converted file is156943 bytes. This establishes an executable
conversion, **not** a qualified detector. No model bytes ship or load automatically.
`cfa-conversion-rejection.json` records identities, operators and aggregate errors.

The study uses PyTorch2.8.0 CPU, NumPy1.26.4, ONNX1.19.0 and ONNX Runtime Web1.30.0.
Nine generated images per checkpoint cover flat/zero/white, random inputs,
odd dimensions, gradient, checkerboard and smooth fields. Block size32 is fixed;
batch1 and even spatial dimensions are explicit trace preconditions. Input
float64 normalization then float32 conversion, valid crop and source order match
the native adapter. No precision reduction or training is used.

Chrome154 WASM single-thread inference was tested with graph optimization
disabled/basic/extended/all. All four settings produced the same aggregate
failure on27 model/image cases each:

- Maximum absolute log-probability error0.0013427734375.
- Maximum probability error0.0002980232238769531.
- Five changed local grid decisions and four changed global grid selections.
- Original-model gradient: one changed local grid creates a suspicion difference
 of0.2611052393913269. Constants also expose exact/near-tie argmax changes.

Applying the browser postprocessing to **native** probabilities instead yields
exact grids, local/global choices and suspicion on this corpus. A28-convolution
intermediate-output probe finds differences from the first layer (approximately
3e-7 at its first dilated convolution) and amplification through later layers.
This locates the disagreement in inference, rather than treating postprocessing
or an altered threshold as a remedy. Specific arithmetic causes remain open.

The WebGPU execution provider also fails. Default layout produced major
divergence (probability difference up to1); explicit NCHW improves this greatly
but still reaches0.000265657901763916 and changes five local/four global decisions
per27-case run. Both disabled/all graph settings were checked. Provider warnings
report CPU fallback for some nodes: these are mixed-provider experiments, not
claims of pure GPU execution. No speedup or memory qualification is claimed.

The existing native panel's CPU-default warning is therefore material. Small
tensors errors cannot justify activating this converted detector, modifying its
decision thresholds, forcing ties or hiding incompatible outputs. The public
registry keeps the entire browser CFA operation unavailable. Other block sizes,
devices, tiled inference boundaries and rendering/NPZ remain unqualified.

Reproduction is development-only. Install ONNX1.19.0 and ml_dtypes0.5.3 into an
isolated `.build/onnx-python` directory and use the unchanged native Python/torch
environment. Extract the npm onnxruntime-web1.30.0 package under
`.build/ort130/package`, verifying its recorded npm SHA512 integrity:

```text
sha512-q0y+JrrtukXSzsBWEMccVfqX25LRmosXHF+CaRJmg8pZClzcV7svNc4rKY3jL02Vb7QmRMDs1SigqR4CXAfKYQ==
```

Run `scripts/generate-cfa-parity-study.py` with that isolated Python import path,
then `node scripts/cfa-parity-study.mjs --provider=wasm`. The optional providers
are `webgpu` and `webgpu-nchw`. Native checkpoints must already exist locally.
All converted weights and raw study arrays remain in excluded `.build`.
The loopback harness serves its excluded development directory; it is not a product model
endpoint. Graph optimization settings in this script are offline experiments,
never startup probes or calibration in the application.

The official [ORT deployment guide](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
describes matching local JavaScript/WASM assets. The
[session options](https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.SessionOptions.html)
describe graph settings; neither is evidence of this model's parity. Model/source
usage and redistribution remain separate: no new permission or public license is
inferred from successful export or from the native private provenance record.

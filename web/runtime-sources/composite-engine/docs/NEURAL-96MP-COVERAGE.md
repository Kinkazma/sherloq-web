# Neural96MP memory paths

All rows use actual12000×8000 JPEG originals and unchanged native448/256/512
network inputs. Rich cases exercise two large regions and a full-image envelope,
three actual inferences, retained full-resolution outputs and a cache-only view.
Every native-coordinate value and every exported NPZ plane is checked. Masks are
exact on these sources; continuous probability differences are reported below.

| Path / proof version | Positive mask pixels | Max map error | Load / analysis / cache / NPZ preparation, s | Peak accounted bytes | Planes / NPZ bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| D2PRL CPU (M1.37) | 68,160,948 | 0.000e+0 | 2.331 / 2667.013 / 23.264 / 61.778 | 3,221,007,456 | 6 / 1,440,016,372 |
| D2PRL GPU (M1.37) | 68,160,948 | 0.000e+0 | 1.808 / 1645.666 / 36.242 / 109.452 | 3,201,593,312 | 6 / 1,440,016,304 |
| MGCF ST CPU (M1.32) | 3,370,950 | 1.729e-5 | 1.200 / 20.580 / 5.683 / 49.502 | 3,191,856,000 | 6 / 1,440,012,552 |
| MGCF MPDN GPU (M1.34) | 411,442 | 2.772e-6 | 1.228 / 18.683 / 2.861 / 12.484 | 2,892,898,351 | 4 / 672,012,868 |
| MGCF16 GPU (M1.41) | 2,400,483 | 1.937e-6 | 1.380 / 21.167 / 2.865 / 16.066 | 3,088,028,932 | 4 / 672,012,768 |
| MGCF ST split GPU (M1.43) | 3,370,950 | 1.144e-5 | 1.227 / 28.260 / 5.672 / 30.709 | 3,191,856,000 | 6 / 1,440,014,924 |
| CMSeg generalization CPU (M1.33) | 935,251 | 1.460e-5 | 1.191 / 46.548 / 3.603 / 13.759 | 3,200,872,430 | 4 / 672,013,940 |
| CMSeg generalization GPU (M1.46) | 935,251 | 1.460e-5 | 1.208 / 39.079 / 3.980 / 15.005 | 2,338,438,660 | 4 / 672,016,516 |
| CMSeg addnoise CPU (M1.34) | 216,407 | 3.558e-5 | 1.175 / 32.079 / 3.601 / 15.778 | 2,355,803,954 | 4 / 672,013,256 |
| CMSeg addnoise GPU (M1.45) | 216,407 | 3.588e-5 | 1.706 / 37.666 / 3.659 / 13.646 | 2,355,803,954 | 4 / 672,015,276 |
| MGCF VIG CPU (M1.34) | 3,848,796 | 3.237e-5 | 1.203 / 65.719 / 2.736 / 23.999 | 2,372,219,601 | 4 / 672,014,112 |
| MGCF VIG GPU (M1.39) | 3,848,796 | 3.237e-5 | 1.462 / 37.332 / 2.774 / 25.372 | 2,713,889,617 | 4 / 672,015,512 |
| MGCF TNT CPU (M1.34) | 4,949,629 | 3.040e-6 | 1.147 / 57.063 / 2.564 / 14.836 | 2,371,490,140 | 4 / 672,013,188 |
| MGCF TNT GPU (M1.38) | 4,949,629 | 3.040e-6 | 1.372 / 30.451 / 2.852 / 73.613 | 2,630,886,876 | 4 / 672,015,440 |

Times are functional observations on the shared workstation; this table is not
a CPU/GPU speed benchmark. The NPZ timer measures archive preparation; complete
readback is verified separately. All runs use a3GiB shared budget, source/results may
use RAM or temporary storage, and exports use OPFS. Detailed storage, exact NPZ
SHA, proof hashes, mean error and execution metadata are in
[the coverage records](neural-96mp-coverage.json). All final owned reservations
are zero. Accounted peaks include heap ceilings and admitted buffers, not driver
residency, browser Blob residency or process RSS.

- **D2PRL CPU:** Rich positive source, two large ROI plus full envelope; native448, complete CPU graph and six source-coordinate planes, cached refilter. [Browser proof](neural-segmented-d2prl-large-rich-cpu-m1-37-extracted-proof.json), [complete NPZ check](neural-segmented-d2prl-large-rich-cpu-m1-37-extracted-npz-proof.json).
- **D2PRL GPU:** The identical rich source and three zones, ordered GPU convolutions with CPU auxiliaries, shared budget, full six-plane refilter/export. [Browser proof](neural-segmented-d2prl-large-rich-webgpu-m1-37-extracted-proof.json), [complete NPZ check](neural-segmented-d2prl-large-rich-webgpu-m1-37-extracted-npz-proof.json).
- **MGCF ST CPU:** Common independent single-thread ONNX source/preparation/projection path for base,16,MPDN,EffNet and ST; ST is the six-plane and largest-model-byte case. This is shared memory-path evidence, not five newly executed96MP networks. [Browser proof](neural-segmented-mgcfdn-st-large-rich-cpu-projection-retention-proof.json), [complete NPZ check](neural-segmented-mgcfdn-st-large-rich-cpu-projection-retention-npz-proof.json).
- **MGCF MPDN GPU:** Separate ONNX WebGPU/CPU session and buffer accounting. [Browser proof](neural-segmented-mgcfdn-mpdn-large-rich-webgpu-m1-34-extracted-proof.json), [complete NPZ check](neural-segmented-mgcfdn-mpdn-large-rich-webgpu-m1-34-extracted-npz-proof.json).
- **MGCF16 GPU:** Larger-model-byte representative of the shared bounded sigmoid ONNX WebGPU/WASM adapter for MPDN/16/EffNet. EffNet memory-path reuse is explicit, not a separately executed96MP EffNet network; its small positive corpus has one declared threshold-mask difference. See MGCF-ORT-GPU.md. [Browser proof](neural-segmented-mgcfdn-16-large-rich-webgpu-m1-41-candidate-proof.json), [complete NPZ check](neural-segmented-mgcfdn-16-large-rich-webgpu-m1-41-candidate-npz-proof.json).
- **MGCF ST split GPU:** Bounded two-session GPU encoder/CPU head path, larger split-model assets and six full output planes. M1.43 retires idle hybrid residency before large projections; all full output hashes equal M1.42, cached view uses five RAM planes and one temporary plane. Base uses the same split-session memory adapter with four planes; its96MP qualification reuses this representative path, not a newly executed base network. GPU ST head remains rejected; continuous CPU/GPU planes can differ while native masks are exact. See MGCF-SPLIT-GPU.md. [Browser proof](neural-segmented-mgcfdn-st-large-rich-webgpu-m1-43-candidate-proof.json), [complete NPZ check](neural-segmented-mgcfdn-st-large-rich-webgpu-m1-43-candidate-npz-proof.json).
- **CMSeg generalization CPU:** Native512, CPU convolution and Winograd backbone plus three global correlations. [Browser proof](neural-segmented-cmseg-generalization-large-rich-cpu-m1-33-extracted-proof.json), [complete NPZ check](neural-segmented-cmseg-generalization-large-rich-cpu-m1-33-extracted-npz-proof.json).
- **CMSeg generalization GPU:** Ordered GPU convolutions and resident-input streamed dot rows for the128x128 global correlation; CPU normalization/Gaussian/softmax/TopK, smaller correlations and Winograd retained.32MiB postprocess workers and parameter/session reuse. New96MP path retains all M1.40 plane hashes; exact binding in cmseg-resident-delivery-binding.json. [Browser proof](neural-segmented-cmseg-generalization-large-rich-webgpu-m1-46-candidate-proof.json), [complete NPZ check](neural-segmented-cmseg-generalization-large-rich-webgpu-m1-46-candidate-npz-proof.json).
- **CMSeg addnoise CPU:** Native512 ONNX encoder with the distinct qualified correlation arithmetic. [Browser proof](neural-segmented-cmseg-addnoise-large-rich-cpu-m1-34-extracted-proof.json), [complete NPZ check](neural-segmented-cmseg-addnoise-large-rich-cpu-m1-34-extracted-npz-proof.json).
- **CMSeg addnoise GPU:** Original CPU ONNX encoder/decoder with resident-input ordered GPU dot rows for the largest full-global correlation. Separate addnoise CPU normalization and all Gaussian/softmax/TopK, two smaller correlations and thresholds unchanged. New distinct96MP path; native masks exact, continuous CPU/GPU planes differ. See CMSEG-ADDNOISE-GPU.md. [Browser proof](neural-segmented-cmseg-addnoise-large-rich-webgpu-m1-45-candidate-proof.json), [complete NPZ check](neural-segmented-cmseg-addnoise-large-rich-webgpu-m1-45-candidate-npz-proof.json).
- **MGCF VIG CPU:** Native-order graph backbone with bounded useful CPU convolution workers. [Browser proof](neural-segmented-mgcfdn-vig-large-rich-cpu-m1-34-extracted-proof.json), [complete NPZ check](neural-segmented-mgcfdn-vig-large-rich-cpu-m1-34-extracted-npz-proof.json).
- **MGCF VIG GPU:** Ordered GPU convolutions and graph dot products; native normalization/TopK/dilation/gather unchanged, with parameter/session reuse; exact delivery binding in vig-distance-delivery-binding.json. [Browser proof](neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-39-candidate-proof.json), [complete NPZ check](neural-segmented-mgcfdn-vig-large-rich-webgpu-m1-39-candidate-npz-proof.json).
- **MGCF TNT CPU:** Native-order attention backbone with bounded useful CPU linear workers. [Browser proof](neural-segmented-mgcfdn-tnt-large-rich-cpu-m1-34-extracted-proof.json), [complete NPZ check](neural-segmented-mgcfdn-tnt-large-rich-cpu-m1-34-extracted-npz-proof.json).
- **MGCF TNT GPU:** Ordered GPU linear layers and outer attention, CPU inner attention/norm/softmax; parameter/session reuse, exact delivery binding in tnt-attention-delivery-binding.json. [Browser proof](neural-segmented-mgcfdn-tnt-large-rich-webgpu-m1-38-candidate-proof.json), [complete NPZ check](neural-segmented-mgcfdn-tnt-large-rich-webgpu-m1-38-candidate-npz-proof.json).

The historical M1.27 D2PRL CPU noise-source run had an empty mask and no cached
second view; its [browser proof](neural-segmented-d2prl-large-cpu-extracted-proof.json)
and [full NPZ check](neural-segmented-d2prl-large-cpu-extracted-npz-proof.json) remain
available. The table now uses new rich positive CPU/GPU source recipes, without
relabelling that older run. Complete plane identity is verified for D2PRL, CMSeg
generalization, VIG and TNT on each family's same rich source.

These results do not prove WordPress cohabitation with the other engines under a
shared budget; that integration belongs to the assembled runtime and UI recipe.
Physical mobile devices and additional browser/GPU vendors remain unqualified.
No synthetic calibration is added to the user path and no native training or
remote service is used.

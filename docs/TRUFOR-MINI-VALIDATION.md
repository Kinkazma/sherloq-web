# TruFor Mini — browser execution performance

TruFor Mini averaged **2.34×** the calculation speed of full TruFor in the current SHERLOQ Web interface: **6.87s** versus **16.11s**, reducing average calculation time by **57.3%**.

Six native JPEG images were measured twice with each method, giving 24 runs. Method order alternated ABBA and BAAB between images. Both methods used the same input bytes, native dimensions, WebGPU backend and normal application resource policy. Each run performed exactly one analysis, with no cache hit, browser error or unexpected external request. Execution receipts reported WebGPU for every useful neural job; no CPU fallback or unknown provider was recorded.

The timed interval runs from the analysis request posted to the worker until its result returns. It includes the worker’s image decoding and numerical work; interface image import, menu interaction and result rendering are excluded.

| Image | Full TruFor, mean | TruFor Mini, mean | Speed gain |
|---|---:|---:|---:|
| 1 | 15.60s | 6.38s | 2.44× |
| 2 | 15.40s | 7.10s | 2.17× |
| 3 | 15.59s | 6.56s | 2.38× |
| 4 | 15.63s | 6.58s | 2.38× |
| 5 | 16.36s | 7.42s | 2.21× |
| 6 | 18.07s | 7.20s | 2.51× |

The overall gain is the sum of full-TruFor times divided by the sum of Mini times, equal to the ratio of means here. The median of the 12 adjacent paired speed ratios was **2.35×**.

These measurements characterize execution speed. They are separate from the detection-quality study. Full TruFor retains its Channel 333 output; Mini uses the frozen model state and produces its own localization and noise-residual outputs.

On two masked examples, browser Mini’s F1 differed from the study implementation by +0.01084 and −0.00504 percentage points. Additional checks passed for CPU execution, streamed NPZ export, cache/result ownership and constrained-memory execution.

On the annotated CocoGlide case, the 65,536 float32 output values were also compared with the browser implementation before the Query→MLP and FFM compositions: they are bit-for-bit identical. The small difference from the archived PyTorch study map therefore predates these optimizations.

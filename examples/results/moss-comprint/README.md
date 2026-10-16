# Moss — Comprint and whole-image AI scores

The original and edited inputs are 1642 × 1094 pixels. Gaël supplied both TIFFs and a separate visual edit reference. The reference was never passed to a detector. Public PNG copies preserve the visible RGB input without the TIFF metadata.

## Comprint

[Original distance map](original-distance.png) · [Edited distance map](edited-distance.png) · [Edited photo and reference above the two Comprint results](comparison.png) · [Input comparison](../../moss/comparison.png)

The tool opens with its colour overlay and also offers the colour heatmap and grayscale map alone. The heatmap keeps its original colours and range. Only overlay transparency starts at zero, reaches 50% at a native distance of 194, then rises quickly towards full opacity. The global opacity and native-distance cutoff remain adjustable, with a cached small proxy during slider movement and precise rendering on release. Scientific Float64 results are unchanged.

The maps were computed by the browser engine at source resolution with the ordinary automatic backend and unchanged shared resource limits. The views use each result's native display range: their brightness is not a probability and is not an absolute scale shared between images. The four-panel figure shows the edited photograph and black-and-white edit reference above the Comprint maps for the original and edited inputs. The edited image produces several local responses near the supplied retouch reference and additional responses elsewhere. This single example does not establish accuracy.

## B-Free and SPAI

Their numerical results are retained in [results.json](results.json). Both classify these whole images on the non-AI side of their default logit threshold, including the partially edited input. These methods score whole-image generation; they cannot exclude localized AI edits. Their indices are not calibrated confidence. Even a correct AI-generated classification does not establish that the depicted content is false.

The independent [CONVEX evaluation](https://arxiv.org/abs/2604.15372) reports substantial missed detections and false alerts for the original models. The study's corpus results are separate from these two image runs and do not qualify this browser adaptation. [Method limits and per-model tables](../../../docs/BROWSER-INSPECTION-METHODS.md#independent-evaluation-of-the-ai-detectors).


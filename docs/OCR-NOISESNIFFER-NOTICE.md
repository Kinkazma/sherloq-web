# OCR and Noise Sniffer — resources, attribution and licenses

The repository’s GPLv3 license remains applicable to the SHERLOQ adaptation.
It does not replace the individual upstream licenses. The model files listed
below are optional resources, not embedded in this document or the bootstrap.
The current resource catalog supplies their identities and checks their contents.

## PaddleOCR models and preprocessing

PP-OCRv6 and PP-LCNet are works of the PaddlePaddle Authors and contributors.
The selected official model cards identify the ONNX weights as Apache-2.0.
The preprocessing specifications are from PaddleOCR/PaddleX, also Apache-2.0.
Retain the [complete Apache 2.0 text](licenses/OCR-APACHE-2.0.txt), upstream
attributions and applicable notices when redistributing these components.

PaddleX preprocessing source attribution:
Copyright (c) 2024 PaddlePaddle Authors. All Rights Reserved.

- [PP-LCNet paper and authors](https://arxiv.org/abs/2109.15099).
- [PP-OCRv6 paper](https://arxiv.org/abs/2606.13108).
- [PaddleOCR code license](https://github.com/PaddlePaddle/PaddleOCR/blob/dab3fe35379033fdcb2d0e9572fac0b36c9a9ebf/LICENSE).
- [PaddleX recognition preprocessing and CTC](https://github.com/PaddlePaddle/PaddleX/blob/4c968d30b9d0d4a693d9eaaef0881c20f8d7d0e0/paddlex/inference/models/text_recognition/processors.py).
- [PaddleX detector preprocessing and DB postprocessing](https://github.com/PaddlePaddle/PaddleX/blob/4c968d30b9d0d4a693d9eaaef0881c20f8d7d0e0/paddlex/inference/models/text_detection/processors.py).
- [PaddleX image-classifier preprocessing](https://github.com/PaddlePaddle/PaddleX/blob/4c968d30b9d0d4a693d9eaaef0881c20f8d7d0e0/paddlex/inference/models/image_classification/predictor.py).

### Selected official file identities

Sizes are exact uncompressed file bytes. Model revisions are pinned in the
source links; the original exported weights are not retrained or quantized by
this adaptation.

| Component | Bytes | SHA-256 | Official source |
| --- | ---: | --- | --- |
| PP-OCRv6 Medium detector | 62,032,837 | `eb13b44b25bb36f89528b68720af8a61d9cf381176107f465db1757b65d086e1` | [Pinned file](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_det_onnx/resolve/61323801669c338b7891481ec7bac61ce31b576a/inference.onnx) |
| PP-OCRv6 Medium recognizer | 76,554,979 | `9c09abf0957f7968c7586464b7397b84ad2387a0497a351af40e9acc71b673ba` | [Pinned file](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx/resolve/50c7eacafc52fa7bcf4194e8cd08e46f8558504b/inference.onnx) |
| Tesseract best English | 15,400,601 | `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba` | [Pinned file](https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/eng.traineddata) |
| Tesseract best French | 3,972,885 | `907743d98915c91a3906dfbf6e48b97598346698fe53aaa797e1a064ffcac913` | [Pinned file](https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/fra.traineddata) |
| PP-LCNet_x1_0 text-line orientation | 6,777,816 | `38aa97cd4be591e0ad304e659f07ba30d946f27a63315433f6659c69c8778345` | [Pinned file](https://huggingface.co/PaddlePaddle/PP-LCNet_x1_0_textline_ori_onnx/resolve/7fdcf3cf7061163eda7183b224aa334bd33068f7/inference.onnx) |

The recognition dictionary is derived from the official recognizer
[`inference.yml`](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx/resolve/50c7eacafc52fa7bcf4194e8cd08e46f8558504b/inference.yml):
the ordered 18708-entry `PostProcess.character_dict` array is encoded as compact
UTF-8 JSON, with no entry reordered or removed. Native CTC decoding adds its
blank token and space. The derived dictionary is 112,366 bytes,
SHA-256 `679f4f4cbbb4f762e84fae998e02c08a556afbd115968104ca3b4aeee5cb2b19`; its upstream terms remain Apache-2.0.

### Adaptation notice

SHERLOQ adds bounded source windows, shared memory/CPU/GPU admission, source
coordinates, explicit model identity checks and retained presentation. Detector
postprocessing uses connected-component convex hulls and minimum rectangles
with a direct rectangle offset. This does not claim bit parity with all
OpenCV/PyClipper contour behavior. Recognition uses a cubic crop and integer
bilinear resize; small resize rounding differences remain documented rather
than claimed globally bit-exact. CTC probabilities and native confidence are
retained; display filtering does not modify the scientific recognition.

## OpenCV geometry and resizing

The `imgwarp.cpp` and `resize.cpp` source files consulted for the cubic kernel,
interpolation table and integer resize retain their own three-clause BSD-style
notice. Do not infer their file license solely from the current repository-wide
Apache 2.0 license. The complete notices from both source files, copyright holders, conditions
and disclaimer are preserved in
[OpenCV geometry license](licenses/OPENCV-GEOMETRY-LICENSE.txt).

- [OpenCV `modules/imgproc/src/imgwarp.cpp`](https://github.com/opencv/opencv/blob/b1ed6b71844fb8907c6d63db94a8a6bf69eca9c8/modules/imgproc/src/imgwarp.cpp); source SHA-256 `a10702e18ea82ca59d3710c7fcd3af24d3dd303831ddd2a38eefb0014c751cad`.
- [OpenCV `modules/imgproc/src/resize.cpp`](https://github.com/opencv/opencv/blob/b1ed6b71844fb8907c6d63db94a8a6bf69eca9c8/modules/imgproc/src/resize.cpp); source SHA-256 `4da518bbd4bb22d2eba77ba189116a5b85440454abe645ab4093dc86dd6ef4c7`.

The adapted crop/resize routines are local changes; the original OpenCV source
is not presented as an unmodified SHERLOQ implementation. Existing OpenCV runtime
licenses and dependency notices remain in their original resource directories.

## Tesseract and language data

Tesseract: Ray Smith and the [upstream authors](https://github.com/tesseract-ocr/tesseract/blob/main/AUTHORS). The English and French weights are works of the Tesseract / tessdata_best contributors. The browser execution layer retains the existing Tesseract.js and Tesseract.js-core contributor notices.

Tesseract and the selected `tessdata_best` English/French resources are
Apache-2.0. The best data are floating LSTM networks and are used with LSTM OEM 1;
the separately available fast language data are not silently substituted.
The `tessdata_best` source explicitly licenses all repository data under
Apache 2.0. Preserve its license and the notices of the already supplied
Tesseract WebAssembly core and its dependencies.

- [Tesseract source and authors](https://github.com/tesseract-ocr/tesseract).
- [Tesseract source license](https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE).
- [Pinned best-language repository](https://github.com/tesseract-ocr/tessdata_best/tree/e12c65a915945e4c28e237a9b52bc4a8f39a0cec).
- [Pinned language-data license](https://github.com/tesseract-ocr/tessdata_best/blob/e12c65a915945e4c28e237a9b52bc4a8f39a0cec/LICENSE).
- [Tesseract data-file documentation](https://tesseract-ocr.github.io/tessdoc/Data-Files.html).
- [Existing Tesseract runtime license](../web/engine-source/vendor/text-ocr/LICENSE).

## Noise Sniffer

Marina Gardella, Pablo Musé, Miguel Colom and Jean-Michel Morel,
*Image Forgery Detection Based on Noise Inspection: Analysis and Refinement of
the Noisesniffer Method*, Image Processing On Line 14 (2024), 86–115,
[doi:10.5201/ipol.2024.462](https://doi.org/10.5201/ipol.2024.462).
The original reference code is distributed by the authors through IPOL under
Apache 2.0; its existing license and provenance stay with the reference source.

- [Official article and source-code download](https://www.ipol.im/pub/art/2024/462/).
- [Preserved reference license](../web/engine-source/vendor/noisesniffer/LICENSE).
- [Preserved reference provenance](../web/engine-source/vendor/noisesniffer/PROVENANCE.md).

SHERLOQ’s corrected implementation retains the global selection and ordered
region-growth semantics. This change adds reuse of valid statistical and
selection stages and bounded provisional presentation; it does not describe
the original reference files as modified upstream code. An anomaly remains
noise-consistency evidence, not a calibrated manipulation probability.

## Shared runtime notices and distribution

The existing ONNX Runtime execution files are reused; their MIT license and
third-party notices remain applicable. The OCR resources do not grant any
trademark endorsement by PaddlePaddle, Tesseract, OpenCV or the Noise Sniffer
authors. A recipient must retain the relevant licenses, attribution and change
notices. The Apache 2.0 text permits redistribution subject to its conditions;
it does not replace the repository’s GPLv3 terms or authorize publication of
any unrelated private material.

- [Existing ONNX Runtime license](../web/engine-source/vendor/d2prl/ONNXRUNTIME-LICENSE.txt).
- [Apache 2.0 license terms](https://www.apache.org/licenses/LICENSE-2.0).
- [GNU license compatibility guidance](https://www.gnu.org/licenses/license-list.en.html#apache2).

No model or runtime payload is included in these documentation files. Their
sizes describe stored resources, not peak inference RAM or a guarantee that
all hardware and browsers can admit the same analysis.

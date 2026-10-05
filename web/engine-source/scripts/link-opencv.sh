#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null
if [ -f native/opencv.cpp ]; then
 if [ ! -f .build/dft-reference.o ]; then python3 scripts/build-dft-reference.py; fi
 if [ ! -f .build/farneback-reference.o ] || [ scripts/build-farneback-reference.py -nt .build/farneback-reference.o ]; then python3 scripts/build-farneback-reference.py; fi
 if [ ! -f .build/butteraugli-reference.o ] || [ scripts/build-butteraugli-reference.py -nt .build/butteraugli-reference.o ]; then python3 scripts/build-butteraugli-reference.py; fi
 python3 scripts/build-comparison-helpers.py
 python3 scripts/build-prnu-fft.py
 python3 scripts/verify-noisesniffer-vendors.py
 python3 scripts/build-noisesniffer-dct.py
 em++ native/opencv.cpp native/noisesniffer-tail.cpp .build/noisesniffer-dct.o .build/prnu-fft.o .build/prnu-fma.o .build/butteraugli-reference.o .build/dft-reference.o .build/farneback-reference.o .build/opencv_contrib-4.11.0/modules/img_hash/src/*.cpp .build/cv/lib/*.a .build/cv/3rdparty/lib/*.a \
  -I vendor/boost-math/include -I .build/opencv-4.11.0/modules/core/include -I .build/opencv-4.11.0/modules/imgproc/include \
  -I .build/opencv-4.11.0/modules/imgcodecs/include -I .build/opencv-4.11.0/modules/photo/include \
  -I .build/opencv-4.11.0/modules/features2d/include -I .build/opencv-4.11.0/modules/calib3d/include \
  -I .build/opencv-4.11.0/modules/flann/include -I .build/opencv-4.11.0/modules/video/include -I .build/cv -I .build/opencv_contrib-4.11.0/modules/img_hash/include \
  -O3 -fexceptions -ffp-contract=off -ffile-prefix-map="$PWD/"= -fdebug-prefix-map="$PWD/"= -sDISABLE_EXCEPTION_CATCHING=0 \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=2147483648 -sFILESYSTEM=0 \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_cv_run","_cv_prnu_prepare","_cv_noisesniffer_statistics","_cv_noisesniffer_log_tail","_cv_prnu_twiddles","_cv_prnu_scalar_test","_cv_prnu_vector_test","_cv_prnu_method","_cv_prnu_noise","_cv_comparison","_cv_comparison_fma_test","_cv_comparison_simd_test","_cv_comparison_score","_cv_comparison_render","_cv_stereo_prepare","_cv_stereo_timings","_cv_stereo_fma_test","_cv_stereo_view","_cv_stereo_offset","_cv_contrast_prepare","_cv_contrast_view","_cv_frequency_prepare","_cv_frequency_view","_cv_frequency_mask","_cv_frequency_frame","_cv_frequency_zero","_cv_model","_cv_pca_model","_cv_plot","_cv_hash","_cv_decode","_cv_decode_gray","_cv_noise_map","_cv_data","_cv_width","_cv_height","_cv_size","_cv_release"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF64","HEAPF32"]' -o vendor/opencv/opencv.js
fi

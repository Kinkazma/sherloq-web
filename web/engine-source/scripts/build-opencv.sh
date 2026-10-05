#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${EMSDK:?Set EMSDK to Emscripten 4.0.15}"
source "$EMSDK/emsdk_env.sh" >/dev/null
mkdir -p .build vendor/opencv
archive=.build/opencv-4.11.0.tar.gz
if [ ! -f "$archive" ]; then curl -fsSL https://github.com/opencv/opencv/archive/refs/tags/4.11.0.tar.gz -o "$archive"; fi
printf '%s  %s\n' '9a7c11f924eff5f8d8070e297b322ee68b9227e003fd600d4b8122198091665f' "$archive" > .build/opencv-source.sha256
shasum -a 256 -c .build/opencv-source.sha256
if [ ! -d .build/opencv-4.11.0/modules ]; then tar -xzf "$archive" -C .build; fi
contrib=.build/opencv-contrib-4.11.0.tar.gz
if [ ! -f "$contrib" ]; then curl -fsSL https://github.com/opencv/opencv_contrib/archive/refs/tags/4.11.0.tar.gz -o "$contrib"; fi
printf '%s  %s\n' '2dfc5957201de2aa785064711125af6abb2e80a64e2dc246aca4119b19687041' "$contrib" > .build/contrib-source.sha256
shasum -a 256 -c .build/contrib-source.sha256
if [ ! -d .build/opencv_contrib-4.11.0/modules ]; then tar -xzf "$contrib" -C .build; fi
emcmake cmake -S .build/opencv-4.11.0 -B .build/cv \
 -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
 -DBUILD_LIST=core,imgproc,imgcodecs,photo,features2d,flann,calib3d,video \
 -DCMAKE_C_FLAGS="-fexceptions -ffile-prefix-map=$PWD/= -fdebug-prefix-map=$PWD/=" -DCMAKE_CXX_FLAGS="-fexceptions -ffp-contract=off -ffile-prefix-map=$PWD/= -fdebug-prefix-map=$PWD/=" \
 -DBUILD_TESTS=OFF -DBUILD_PERF_TESTS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_opencv_apps=OFF \
 -DBUILD_opencv_python2=OFF -DBUILD_opencv_python3=OFF -DBUILD_JAVA=OFF \
 -DWITH_IPP=OFF -DWITH_OPENCL=OFF -DWITH_OPENMP=OFF -DWITH_TBB=OFF -DWITH_PTHREADS_PF=OFF \
 -DWITH_ITT=OFF -DWITH_EIGEN=OFF -DWITH_LAPACK=OFF -DWITH_PROTOBUF=OFF \
 -DWITH_FFMPEG=OFF -DWITH_GSTREAMER=OFF -DWITH_AVFOUNDATION=OFF -DWITH_QUIRC=OFF \
 -DWITH_JASPER=OFF -DWITH_WEBP=OFF -DWITH_OPENJPEG=OFF -DWITH_OPENEXR=OFF -DWITH_GDAL=OFF \
 -DWITH_JPEG=ON -DBUILD_JPEG=ON -DWITH_PNG=ON -DBUILD_PNG=ON -DBUILD_ZLIB=ON \
 -DWITH_TIFF=ON -DBUILD_TIFF=ON -DCPU_BASELINE='' -DCPU_DISPATCH='' -DCV_ENABLE_INTRINSICS=OFF
# OpenCV otherwise embeds the configure report (absolute host/compiler paths).
# Exact reproducible options are above; this diagnostic string is not an algorithm.
printf '"OpenCV 4.11.0; portable SHERLOQ WebAssembly; build options in scripts/build-opencv.sh\\n"\n' > .build/cv/modules/core/version_string.inc
cmake --build .build/cv -j 2
python3 scripts/build-dft-reference.py
bash scripts/link-opencv.sh
cp .build/opencv-4.11.0/LICENSE vendor/opencv/LICENSE
cp .build/opencv-4.11.0/3rdparty/libtiff/COPYRIGHT vendor/opencv/TIFF-LICENSE.txt
cp .build/opencv-4.11.0/3rdparty/libpng/LICENSE vendor/opencv/PNG-LICENSE.txt
cp .build/opencv-4.11.0/3rdparty/zlib/zlib.h vendor/opencv/zlib.h
cp .build/opencv_contrib-4.11.0/LICENSE vendor/opencv/CONTRIB-LICENSE.txt
cp .build/opencv-4.11.0/3rdparty/libjpeg-turbo/LICENSE.md vendor/opencv/JPEG-LICENSE.md
# Carotene has its full redistribution notice in source headers.
sed -n '1,/^ \*\//p' .build/opencv-4.11.0/3rdparty/carotene/src/colorconvert.cpp > vendor/opencv/CAROTENE-LICENSE.txt

# The optical-flow implementation retains its original Intel/Willow Garage notice.
sed -n '1,/^#include/{ /^#include/!p; }' .build/opencv-4.11.0/modules/video/src/optflowgf.cpp > vendor/opencv/FARNEBACK-LICENSE.txt

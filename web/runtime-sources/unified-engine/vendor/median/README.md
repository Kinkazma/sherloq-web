OpenCV4.11.0 core/imgproc linked for bounded64×64 median-model features.
Source: native/median-features.cpp and comparison-fma.h; reproduce with
scripts/build-opencv.sh then scripts/build-median.sh, Emscripten4.0.15.
The separate module has a fixed16 MiB maximum heap for its64×64 blocks.
No trained model weights, automatic download or training are included.
OpenCV license: LICENSE. This component is under development for0.22.

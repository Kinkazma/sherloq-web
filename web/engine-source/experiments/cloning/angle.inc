// OpenCV 4.11.0 non-Emscripten scalar fastAtan2 polynomial.
// Derived from modules/core/src/mathfuncs_core.simd.hpp, OpenCV Apache-2.0.
// Contractions are made explicit by the offline LLVM build step.
static inline float cloningNativeAngle(float y, float x) {
    const float p1 = 0.9997878412794807f*(float)(180/CV_PI);
    const float p3 = -0.3258083974640975f*(float)(180/CV_PI);
    const float p5 = 0.1555786518463281f*(float)(180/CV_PI);
    const float p7 = -0.04432655554792128f*(float)(180/CV_PI);
    float ax = std::abs(x), ay = std::abs(y), a, c, c2;
    if (ax >= ay) {
        c = ay/(ax+(float)DBL_EPSILON); c2 = c*c;
        a = (((p7*c2+p5)*c2+p3)*c2+p1)*c;
    } else {
        c = ax/(ay+(float)DBL_EPSILON); c2 = c*c;
        a = 90.f-(((p7*c2+p5)*c2+p3)*c2+p1)*c;
    }
    if (x < 0) a = 180.f-a;
    if (y < 0) a = 360.f-a;
    return a;
}

// Experimental sidecar: imports the existing copy-tree memory, no allocator,
// no globals/data/stack workspace. Must remain private until qualification.
#ifdef SPARSE_DISTANCE_SIMD
#include <wasm_simd128.h>
#endif

static inline float square_difference(float a, float b) {
  const float d = a - b;
  return d * d;
}

#ifdef SPARSE_DISTANCE_SIMD
static inline v128_t square4(const float* a, const float* b) {
  const v128_t d = wasm_f32x4_sub(wasm_v128_load(a), wasm_v128_load(b));
  return wasm_f32x4_mul(d, d);
}
#endif

static float numpy_squared_sum(const float* a, const float* b, int n) {
  if (n < 8) {
    float sum = -0.0f;
    for (int i = 0; i < n; ++i) sum += square_difference(a[i], b[i]);
    return sum;
  }
  if (n > 128) {
    int cut = n / 2;
    cut -= cut % 8;
    const float left = numpy_squared_sum(a, b, cut);
    const float right = numpy_squared_sum(a + cut, b + cut, n - cut);
    return left + right;
  }
  int i = 8;
#ifdef SPARSE_DISTANCE_SIMD
  v128_t lo = square4(a, b), hi = square4(a + 4, b + 4);
  for (; i < n - n % 8; i += 8) {
    lo = wasm_f32x4_add(lo, square4(a + i, b + i));
    hi = wasm_f32x4_add(hi, square4(a + i + 4, b + i + 4));
  }
  const float r0 = wasm_f32x4_extract_lane(lo, 0), r1 = wasm_f32x4_extract_lane(lo, 1);
  const float r2 = wasm_f32x4_extract_lane(lo, 2), r3 = wasm_f32x4_extract_lane(lo, 3);
  const float r4 = wasm_f32x4_extract_lane(hi, 0), r5 = wasm_f32x4_extract_lane(hi, 1);
  const float r6 = wasm_f32x4_extract_lane(hi, 2), r7 = wasm_f32x4_extract_lane(hi, 3);
#else
  float r0 = square_difference(a[0], b[0]), r1 = square_difference(a[1], b[1]);
  float r2 = square_difference(a[2], b[2]), r3 = square_difference(a[3], b[3]);
  float r4 = square_difference(a[4], b[4]), r5 = square_difference(a[5], b[5]);
  float r6 = square_difference(a[6], b[6]), r7 = square_difference(a[7], b[7]);
  for (; i < n - n % 8; i += 8) {
    r0 += square_difference(a[i], b[i]); r1 += square_difference(a[i + 1], b[i + 1]);
    r2 += square_difference(a[i + 2], b[i + 2]); r3 += square_difference(a[i + 3], b[i + 3]);
    r4 += square_difference(a[i + 4], b[i + 4]); r5 += square_difference(a[i + 5], b[i + 5]);
    r6 += square_difference(a[i + 6], b[i + 6]); r7 += square_difference(a[i + 7], b[i + 7]);
  }
#endif
  const float left = (r0 + r1) + (r2 + r3);
  const float right = (r4 + r5) + (r6 + r7);
  float sum = left + right;
  for (; i < n; ++i) sum += square_difference(a[i], b[i]);
  return sum;
}

// LLVM may otherwise narrow sqrt(double(float)) to sqrt(float). Keep the
// specified Float64 operation in a separate noninlined function.
// Its workspace is still only native locals, as checked in the WASM audit.
static __attribute__((noinline)) double square_root64(double value) {
  return __builtin_sqrt(value);
}

extern "C" double sparse_float_distance(const float* descriptors, int dimensions, int i, int j) {
  const float sum = numpy_squared_sum(descriptors + j * dimensions, descriptors + i * dimensions, dimensions);
  // Match Math.fround(Math.sqrt(sum)), including its Float64 square root.
  return static_cast<float>(square_root64(static_cast<double>(sum)));
}

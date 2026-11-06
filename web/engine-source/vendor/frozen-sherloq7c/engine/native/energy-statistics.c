// Exact NumPy float32 pairwise tree: eight independent lanes, split aligned
// to eight above 128 values. No reassociation, reciprocal or fused multiply-add.
#include <stdint.h>
#include <wasm_simd128.h>

static float term(float value, float mean, uint32_t squared) {
  if (!squared) return value;
  const float difference = value - mean;
  return difference * difference;
}
static v128_t terms(const float *values, v128_t mean, uint32_t squared) {
  v128_t value = wasm_v128_load(values);
  if (!squared) return value;
  const v128_t difference = wasm_f32x4_sub(value, mean);
  return wasm_f32x4_mul(difference, difference);
}
static float pairwise(const float *values, uint32_t count, float mean,
                      uint32_t squared) {
  if (count < 8) {
    float total = -0.0f;
    for (uint32_t i = 0; i < count; ++i)
      total = total + term(values[i], mean, squared);
    return total;
  }
  if (count > 128) {
    const uint32_t cut = (count / 2) & ~7u;
    const float left = pairwise(values, cut, mean, squared);
    const float right = pairwise(values + cut, count - cut, mean, squared);
    return left + right;
  }
  const v128_t average = wasm_f32x4_splat(mean);
  v128_t a = terms(values, average, squared);
  v128_t b = terms(values + 4, average, squared);
  uint32_t i = 8;
  for (; i < count - count % 8; i += 8) {
    a = wasm_f32x4_add(a, terms(values + i, average, squared));
    b = wasm_f32x4_add(b, terms(values + i + 4, average, squared));
  }
  const float ab = wasm_f32x4_extract_lane(a, 0) + wasm_f32x4_extract_lane(a, 1);
  const float cd = wasm_f32x4_extract_lane(a, 2) + wasm_f32x4_extract_lane(a, 3);
  const float eg = wasm_f32x4_extract_lane(b, 0) + wasm_f32x4_extract_lane(b, 1);
  const float hj = wasm_f32x4_extract_lane(b, 2) + wasm_f32x4_extract_lane(b, 3);
  const float left = ab + cd;
  const float right = eg + hj;
  float total = left + right;
  for (; i < count; ++i) total = total + term(values[i], mean, squared);
  return total;
}
__attribute__((export_name("energy_pairwise")))
float energy_pairwise(const float *values, uint32_t count, float mean,
                      uint32_t squared) {
  return pairwise(values, count, mean, squared);
}

// Stable compaction writes only behind the current input. Integer transport
// preserves the original Float32 bits, including signed zero and subnormals.
__attribute__((export_name("energy_filter")))
uint32_t energy_filter(uint32_t *words, uint32_t count, float lower,
                       float upper, uint32_t mode) {
  uint32_t kept = 0, i = 0;
  const v128_t low = wasm_f32x4_splat(lower);
  const v128_t high = wasm_f32x4_splat(upper);
  for (; i + 4 <= count; i += 4) {
    const v128_t value = wasm_v128_load(words + i);
    const v128_t selected = mode == 0
      ? wasm_v128_and(wasm_f32x4_ge(value, low), wasm_f32x4_le(value, high))
      : mode == 1 ? wasm_f32x4_le(value, low) : wasm_f32x4_ge(value, high);
    const uint32_t mask = wasm_i32x4_bitmask(selected);
    if (mask & 1) words[kept++] = wasm_i32x4_extract_lane(value, 0);
    if (mask & 2) words[kept++] = wasm_i32x4_extract_lane(value, 1);
    if (mask & 4) words[kept++] = wasm_i32x4_extract_lane(value, 2);
    if (mask & 8) words[kept++] = wasm_i32x4_extract_lane(value, 3);
  }
  for (; i < count; ++i) {
    union { uint32_t bits; float value; } scalar;
    scalar.bits = words[i];
    const uint32_t selected = mode == 0
      ? scalar.value >= lower && scalar.value <= upper
      : mode == 1 ? scalar.value <= lower : scalar.value >= upper;
    if (selected) words[kept++] = scalar.bits;
  }
  return kept;
}

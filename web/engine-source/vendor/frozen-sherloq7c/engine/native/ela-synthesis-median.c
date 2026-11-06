// Exact independent byte order statistics. No colour or ELA calculation lives
// here: the caller supplies frame-major RGB8 bytes after per-frame equalization.
#include <stdint.h>
#include <wasm_simd128.h>

static v128_t counts_le_rank(const uint8_t *input, uint32_t count,
                            uint32_t stride, uint32_t column,
                            v128_t candidate, uint32_t rank) {
  const v128_t zero = wasm_i8x16_splat(0);
  if (count <= 255) {
    v128_t counts = zero;
    for (uint32_t q = 0; q < count; ++q) {
      const v128_t values = wasm_v128_load(input + q * stride + column);
      // The comparison is 0xff for true. Subtracting adds one modulo 256;
      // the largest possible count in this branch is exactly 255.
      counts = wasm_i8x16_sub(counts, wasm_u8x16_lt(values, candidate));
    }
    return wasm_u8x16_le(counts, wasm_i8x16_splat((int8_t)rank));
  }
  v128_t lo = zero, hi = zero;
  for (uint32_t q = 0; q < count; ++q) {
    const v128_t mask = wasm_u8x16_lt(
      wasm_v128_load(input + q * stride + column), candidate);
    lo = wasm_i16x8_sub(lo, wasm_i16x8_extend_low_i8x16(mask));
    hi = wasm_i16x8_sub(hi, wasm_i16x8_extend_high_i8x16(mask));
  }
  const v128_t limit = wasm_i16x8_splat((int16_t)rank);
  return wasm_i8x16_narrow_i16x8(wasm_u16x8_le(lo, limit),
                                wasm_u16x8_le(hi, limit));
}

static v128_t median16(const uint8_t *input, uint32_t count,
                      uint32_t stride, uint32_t column) {
  const v128_t zero = wasm_i8x16_splat(0);
  if (count == 1) return wasm_v128_load(input + column);
  if (count == 2) {
    const v128_t a = wasm_v128_load(input + column);
    const v128_t b = wasm_v128_load(input + stride + column);
    return wasm_i8x16_sub(wasm_u8x16_avgr(a, b),
      wasm_v128_and(wasm_v128_xor(a, b), wasm_i8x16_splat(1)));
  }
  const uint32_t rank = count >> 1;
  v128_t upper = zero;
  // count(values < candidate) <= rank iff the order statistic is >= candidate.
  // Choosing its bits from high to low therefore recovers the exact byte.
  for (uint32_t bit = 128; bit; bit >>= 1) {
    const v128_t candidate = wasm_v128_or(upper, wasm_i8x16_splat((int8_t)bit));
    upper = wasm_v128_bitselect(candidate, upper,
      counts_le_rank(input, count, stride, column, candidate, rank));
  }
  if (count & 1) return upper;

  v128_t below = zero, lo = zero, hi = zero;
  for (uint32_t q = 0; q < count; ++q) {
    const v128_t values = wasm_v128_load(input + q * stride + column);
    const v128_t mask = wasm_u8x16_lt(values, upper);
    below = wasm_u8x16_max(below, wasm_v128_and(values, mask));
    lo = wasm_i16x8_sub(lo, wasm_i16x8_extend_low_i8x16(mask));
    hi = wasm_i16x8_sub(hi, wasm_i16x8_extend_high_i8x16(mask));
  }
  const v128_t limit = wasm_i16x8_splat((int16_t)rank);
  const v128_t exactly_rank = wasm_i8x16_narrow_i16x8(
    wasm_i16x8_eq(lo, limit), wasm_i16x8_eq(hi, limit));
  // With duplicates at the central ranks both medians equal upper. Otherwise
  // exactly rank bytes lie below upper, so maxbelow is the lower median.
  const v128_t lower = wasm_v128_bitselect(below, upper, exactly_rank);
  // avgr rounds upward; subtracting the low xor bit produces floor((a+b)/2)
  // without overflowing the byte addition, including 0/255 and 254/255.
  return wasm_i8x16_sub(wasm_u8x16_avgr(lower, upper),
    wasm_v128_and(wasm_v128_xor(lower, upper), wasm_i8x16_splat(1)));
}

static uint8_t median1(const uint8_t *input, uint32_t count,
                       uint32_t stride, uint32_t column) {
  const uint32_t rank = count >> 1;
  uint32_t upper = 0;
  for (uint32_t bit = 128; bit; bit >>= 1) {
    const uint32_t candidate = upper | bit;
    uint32_t below = 0;
    for (uint32_t q = 0; q < count; ++q)
      below += input[q * stride + column] < candidate;
    if (below <= rank) upper = candidate;
  }
  if (count & 1) return (uint8_t)upper;
  uint32_t below = 0, lower = 0;
  for (uint32_t q = 0; q < count; ++q) {
    const uint32_t value = input[q * stride + column];
    if (value < upper) { ++below; if (value > lower) lower = value; }
  }
  if (below != rank) lower = upper;
  return (uint8_t)((lower + upper) >> 1);
}

// start/end are byte columns, independent of RGB pixel boundaries. The caller
// bounds each invocation for cooperative cancellation and owns all extents.
__attribute__((export_name("median_block")))
void median_block(const uint8_t *input, uint8_t *output, uint32_t count,
                  uint32_t stride, uint32_t start, uint32_t end) {
  uint32_t column = start;
  for (; column + 16 <= end; column += 16)
    wasm_v128_store(output + column, median16(input, count, stride, column));
  for (; column < end; ++column)
    output[column] = median1(input, count, stride, column);
}

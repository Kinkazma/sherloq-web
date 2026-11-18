/* Bounded color projector: the already-qualified exported LCMS linear input,
 * actual matrix/offset and complete sRGB output LUT. No ICC synthesis, input
 * quantization or pow per pixel. Source uint16 samples are read-only.
 * Requires the complete JS model validator before use.
 */
#include <stdint.h>
#include <math.h>
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

static uint8_t output8(const float *m, uint32_t encoded, float v) {
    if (v < 0.0f) v=0.0f;
    if (v > 1.0f) v=1.0f;
    const float x=v*65535.0f;
    const uint32_t j=(uint32_t)x, next=j<65535 ? j+1 : 65535;
    const float a=m[encoded+j], delta=m[encoded+next]-a;
    const float y=a+delta*(x-(float)j);
    /* JS/GPU model rounds the product to float32 before its final +.5.
     * Keep that product, then perform the JS addition exactly in double. */
    const float product=y*65535.0f;
    const double rounded=(double)product+0.5;
    const uint32_t word=rounded<0.0 ? 0 : rounded>65535.0 ? 65535 : (uint32_t)rounded;
    return (uint8_t)((word*65281u+8388608u)>>24u);
}

void lcms_linear_rgb8_scalar(const float *m, const uint16_t *input,
                             uint8_t *output, uint32_t pixels) {
    const uint32_t at=(uint32_t)m[29], stride=(uint32_t)m[3], encoded=(uint32_t)m[31];
    const float *rTrc=m+at, *gTrc=rTrc+stride, *bTrc=gTrc+stride;
    for (uint32_t i=0; i<pixels; i++) {
        const float r=rTrc[input[3*i]], g=gTrc[input[3*i+1]], b=bTrc[input[3*i+2]];
        for (uint32_t c=0; c<3; c++) {
            const uint32_t k=5+3*c;
            const float p0=m[k]*r, p1=m[k+1]*g, p2=m[k+2]*b;
            const float sum01=p0+p1, sum012=sum01+p2, v=sum012-m[26+c];
            output[3*i+c]=output8(m,encoded,v);
        }
    }
}

#ifdef __wasm_simd128__
void lcms_linear_rgb8_simd(const float *m, const uint16_t *input,
                           uint8_t *output, uint32_t pixels) {
    const uint32_t at=(uint32_t)m[29], stride=(uint32_t)m[3], encoded=(uint32_t)m[31];
    const float *rt=m+at, *gt=rt+stride, *bt=gt+stride;
    v128_t matrix[9], offset[3];
    for (uint32_t k=0;k<9;k++) matrix[k]=wasm_f32x4_splat(m[5+k]);
    for (uint32_t c=0;c<3;c++) offset[c]=wasm_f32x4_splat(m[26+c]);
    uint32_t i=0;
    for (;i+4<=pixels;i+=4) {
        const uint16_t *p=input+3*i;
        const v128_t r=wasm_f32x4_make(rt[p[0]],rt[p[3]],rt[p[6]],rt[p[9]]);
        const v128_t g=wasm_f32x4_make(gt[p[1]],gt[p[4]],gt[p[7]],gt[p[10]]);
        const v128_t b=wasm_f32x4_make(bt[p[2]],bt[p[5]],bt[p[8]],bt[p[11]]);
        for (uint32_t c=0;c<3;c++) {
            const uint32_t k=3*c;
            const v128_t p0=wasm_f32x4_mul(matrix[k],r), p1=wasm_f32x4_mul(matrix[k+1],g), p2=wasm_f32x4_mul(matrix[k+2],b);
            const v128_t v=wasm_f32x4_sub(wasm_f32x4_add(wasm_f32x4_add(p0,p1),p2),offset[c]);
            output[3*i+c]=output8(m,encoded,wasm_f32x4_extract_lane(v,0));
            output[3*(i+1)+c]=output8(m,encoded,wasm_f32x4_extract_lane(v,1));
            output[3*(i+2)+c]=output8(m,encoded,wasm_f32x4_extract_lane(v,2));
            output[3*(i+3)+c]=output8(m,encoded,wasm_f32x4_extract_lane(v,3));
        }
    }
    if (i<pixels) lcms_linear_rgb8_scalar(m,input+3*i,output+3*i,pixels-i);
}
#endif

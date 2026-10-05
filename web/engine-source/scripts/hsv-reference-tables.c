/* Build-time oracle for the reference OpenCV 4.11 Carotene reciprocal tables.
 * Never included in the portable browser runtime. Requires the reference NEON ISA. */
#include <arm_neon.h>
#include <stdio.h>
int main(void){puts("// Reference Carotene reciprocal refinement, captured as portable integer constants.");
 for(int kind=0;kind<2;kind++){printf("static const int hsv%s[256]={0",kind?"HDiv":"SDiv");for(int i=1;i<256;i++){
  float32x4_t value=vdupq_n_f32((float)(kind?6*i:i)),inv=vrecpeq_f32(value);inv=vmulq_f32(inv,vrecpsq_f32(inv,value));
  float32x4_t raw=vmulq_n_f32(inv,(float)((kind?180:255)<<12));
  /* Carotene vroundq_u32_f32 uses nearest-even on the native reference. */
  uint32x4_t result=vcvtnq_u32_f32(raw);printf(",%u",vgetq_lane_u32(result,0));
 }puts("};");}return 0;}

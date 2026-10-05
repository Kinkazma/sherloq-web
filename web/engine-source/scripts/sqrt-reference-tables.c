/* Build-time NEON estimate oracle; portable constants, no device-vendor dispatch. */
#include <arm_neon.h>
#include <stdio.h>
#include <stdint.h>
#include <string.h>
int main(void){
 for(int kind=0;kind<3;kind++){printf("static const uint32_t %s[256]={",kind==0?"reciprocalEstimate":kind==1?"rsqrtEstimateOne":"rsqrtEstimateTwo");for(int i=0;i<256;i++){uint32_t bits=((kind==2?128u:127u)<<23)|((uint32_t)i<<15);float f;memcpy(&f,&bits,4);float32x2_t v=vdup_n_f32(f);v=kind?vrsqrte_f32(v):vrecpe_f32(v);f=vget_lane_f32(v,0);memcpy(&bits,&f,4);printf("%s%u",i?",":"",bits);}puts("};");}return 0;
}

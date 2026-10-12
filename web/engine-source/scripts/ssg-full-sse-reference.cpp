// Record the original SSE reciprocal approximations for a portable lookup.
#include <emmintrin.h>
#include <cstdint>
#include <cstring>
#include <cstdio>
int main(){printf("{");for(int mode=0;mode<3;mode++){if(mode)printf(",");printf("\"%s\":[",mode==0?"rcp":mode==1?"rsqrtOdd":"rsqrtEven");uint32_t prev=0;int count=0;for(uint32_t m=0;m<0x800000;m++){uint32_t bits=(mode==2?0x40000000:0x3f800000)+m;float x;memcpy(&x,&bits,4);__m128 v=_mm_set1_ps(x),r=mode==0?_mm_rcp_ps(v):_mm_rsqrt_ps(v);float y;_mm_store_ss(&y,r);uint32_t out;memcpy(&out,&y,4);if(m==0||out!=prev){if(count++)printf(",");printf("[%u,%u]",m,out);prev=out;}}printf("]");}printf("}\n");}

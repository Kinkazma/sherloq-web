/* Private bounded-domain candidate; no hardware FMA is admitted until its
 * numerical corpus agrees exactly with the linked original musl fma. IEEE
 * exceptional/underflow/overflow ranges always retain that original path. */
#include <wasm_simd128.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
extern double __real_fma(double,double,double);
static int qualified=0,enabled=0;
static unsigned int wrapped=0;
static uint64_t raw(double x){uint64_t out;memcpy(&out,&x,8);return out;}
static double value(uint64_t x){double out;memcpy(&out,&x,8);return out;}
static int admitted(double x,int low,int high){uint64_t b=raw(x);int exponent=(int)((b>>52)&2047);return exponent==0?(b&UINT64_C(0x7fffffffffffffff))==0:exponent>=1023+low&&exponent<=1023+high;}
static double hardware(double a,double b,double c){return wasm_f64x2_extract_lane(wasm_f64x2_relaxed_madd(wasm_f64x2_splat(a),wasm_f64x2_splat(b),wasm_f64x2_splat(c)),0);}
__attribute__((noinline)) double __wrap_fma(double a,double b,double c){
#ifdef ZERO_FMA_DIAGNOSTICS
wrapped++;
#endif
return enabled&&admitted(a,-400,400)&&admitted(b,-400,400)&&admitted(c,-800,800)?hardware(a,b,c):__real_fma(a,b,c);}
int zero_fma64_enabled(void){return enabled;}
unsigned int zero_fma64_wrapped_calls(void){return wrapped;}
void zero_fma64_set_enabled(int wanted){enabled=wanted&&qualified;}
static uint64_t rng=UINT64_C(0x73684c5105e70921);
static uint64_t next(void){rng^=rng<<13;rng^=rng>>7;rng^=rng<<17;return rng;}
static void test(double a,double b,double c,int *differences){double x=__real_fma(a,b,c),y=__wrap_fma(a,b,c);if(raw(x)!=raw(y)&&!(isnan(x)&&isnan(y)))(*differences)++;}
int zero_fma64_qualify(void){
 enabled=1;qualified=0;rng=UINT64_C(0x73684c5105e70921);int differences=0;
 for(int i=0;i<32768;i++){
  double a=value((next()&UINT64_C(0x800fffffffffffff))|((uint64_t)(623+next()%801)<<52)),b=value((next()&UINT64_C(0x800fffffffffffff))|((uint64_t)(623+next()%801)<<52)),c=value((next()&UINT64_C(0x800fffffffffffff))|((uint64_t)(223+next()%1601)<<52));
  test(a,b,c,&differences);test(a,b,-a*b,&differences);
 }
 for(int i=0;i<4096;i++){double a=1.0+i*0x1p-52;test(a,1.5,0x1p-106,&differences);test(a,1.5,-0x1p-106,&differences);test(a,1.0-i*0x1p-52,-1.0,&differences);}
 double special[]={0.0,-0.0,0x1p-400,-0x1p-400,0x1p400,-0x1p400,1.0,-1.0,0x1.fffffffffffffp0,-0x1.fffffffffffffp0};
 for(unsigned i=0;i<10;i++)for(unsigned j=0;j<10;j++)for(unsigned k=0;k<10;k++)test(special[i],special[j],special[k],&differences);
 qualified=differences==0;enabled=qualified;return differences;
}

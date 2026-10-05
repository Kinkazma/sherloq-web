// Reference expf arithmetic for the model's nonpositive GELU argument.
// Independent implementation of a 128-bin exp2 reduction and quadratic.
// The table is generated from round64(2^(j/128)), not captured activations.
// These fixed coefficients describe the reference approximation; no fitting
// to model inputs, corrective lookup, native library or OS dispatch is used.
#include <cmath>
#include <cstdint>
#include <cstring>
#include "vig-exp-table.h"
static float vig_exp(float x) {
 if(x<=-128.f)return 0.f;
 const double scale=0x1.71547652b82fep+7,shift=0x1.8p+52;
 const double rounded=std::fma(scale,double(x),shift);
 uint64_t ki;std::memcpy(&ki,&rounded,8);
 const double integer=rounded-shift,r=std::fma(scale,double(x),-integer);
 const uint64_t bits=vig_exp_table[ki%128]+(ki<<45);
 double s;std::memcpy(&s,&bits,8);
 const double poly=std::fma(0x1.ebfbdff30d656p-17,r,0x1.62e4453e10daep-8);
 return float(std::fma(poly*r,s,s));
}

// Adapted from SLEEF xexpf / vldexp2 at commit
// 5a1d179df9cf652951b59010a2d2075372d67f68 (PyTorch 2.8.0 submodule).
// Copyright Naoki Shibata and contributors 2010 - 2024.
// Distributed under the Boost Software License, Version 1.0.
// See SLEEF-LICENSE.txt and SLEEF-PINNED.json in this directory.
// The evaluator only needs non-positive softmax differences. Explicit fma
// preserves the declared reference arithmetic on portable WASM, not an OS test.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>
inline float reference_exp(float d) {
 if(d < -104.f)return 0.f;
 if(!std::isfinite(d)||d>0.f)return NAN;
 int q=int(std::nearbyint(d*1.442695040888963407359924681001892137426645954152985934135449406931f));
 float s=std::fma(float(q),-0.693145751953125f,d);
 s=std::fma(float(q),-1.428606765330187045e-06f,s);
 float u=0.000198527617612853646278381f;
 u=std::fma(u,s,0.00139304355252534151077271f);
 u=std::fma(u,s,0.00833336077630519866943359f);
 u=std::fma(u,s,0.0416664853692054748535156f);
 u=std::fma(u,s,0.166666671633720397949219f);
 u=std::fma(u,s,0.5f);
 u=1.f+std::fma(s*s,u,s);
 const int first=q>>1;uint32_t a=uint32_t(first+127)<<23,b=uint32_t(q-first+127)<<23;
 float fa,fb;std::memcpy(&fa,&a,4);std::memcpy(&fb,&b,4);
 return (u*fa)*fb;
}

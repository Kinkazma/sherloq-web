#pragma once
// Exact representation specialization of SSG's four periodic max/min lines.
// Only +0, 1 and this operation's neutral infinity enter the bitset route.
#include <cstdint>
#include <cmath>
#include <cstring>
#include <vector>
#include <limits>
#include <algorithm>
struct SsgN4BitOffset{int row,word,shift;};
static void ssg_n4_bitline(const std::vector<uint32_t>&known,const std::vector<uint32_t>&dominant,std::vector<uint32_t>&outKnown,std::vector<uint32_t>&outDominant,int width,int height,int dx,int dy,int radius){
 const int stride=(width+31)/32;const uint32_t tail=(width%32)?(uint32_t(1)<<(width%32))-1:UINT32_MAX;
 std::vector<SsgN4BitOffset> offsets;offsets.reserve(size_t(2)*radius+1);
 for(int k=-radius;k<=radius;k++){const int x=k*dx,q=x>=0?x/32:-int((unsigned(-x)+31)/32);offsets.push_back({k*dy,q,x-q*32});}
 for(int y=0;y<height;y++)for(int word=0;word<stride;word++){
  uint32_t a=0,b=0;
  for(const auto&o:offsets){const int yy=y+o.row;if(yy<0||yy>=height)continue;const int q=word+o.word;uint32_t ka=0,va=0,kb=0,vb=0;
   if(q>=0&&q<stride){ka=known[size_t(yy)*stride+q];va=dominant[size_t(yy)*stride+q];}
   if(o.shift&&q+1>=0&&q+1<stride){kb=known[size_t(yy)*stride+q+1];vb=dominant[size_t(yy)*stride+q+1];}
   a|=ka>>o.shift;b|=va>>o.shift;if(o.shift){a|=kb<<(32-o.shift);b|=vb<<(32-o.shift);}
  }
  if(word==stride-1){a&=tail;b&=tail;}outKnown[size_t(y)*stride+word]=a;outDominant[size_t(y)*stride+word]=b;
 }
}
static bool ssg_n4_binary_bitset(const double*in,double*out,int w,int h,int radius,bool dilate){
 if(w<1||h<1||radius<0||radius>512)return false;
 const uint64_t neutralBits=dilate?UINT64_C(0xfff0000000000000):UINT64_C(0x7ff0000000000000),oneBits=UINT64_C(0x3ff0000000000000);const size_t n=size_t(w)*h;
 // Validate the entire input before creating any result; -0 and all NaN
 // encodings retain the unchanged f64 implementation and its exact bits.
 for(size_t i=0;i<n;i++){uint64_t bits;std::memcpy(&bits,in+i,8);if(bits!=0&&bits!=oneBits&&bits!=neutralBits)return false;}
 int b=int(std::floor(radius/(2+std::sqrt(2.0)))),a=int(std::floor(radius*(std::sqrt(2.0)-1)));if(radius-(a+2*b)>1)a++;if(radius==1){a=1;b=0;}
 const int pad=a+2*b;if(w>std::numeric_limits<int>::max()-2*pad||h>std::numeric_limits<int>::max()-2*pad)return false;const int pw=w+2*pad,ph=h+2*pad;if(pw>std::numeric_limits<int>::max()-31)return false;const int stride=(pw+31)/32;
 const size_t words=size_t(stride)*ph;std::vector<uint32_t>known(words),dominant(words),nextKnown(words),nextDominant(words);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){uint64_t bits;std::memcpy(&bits,in+size_t(y)*w+x,8);if(bits==neutralBits)continue;const int xx=x+pad;const size_t index=size_t(y+pad)*stride+xx/32;const uint32_t bit=uint32_t(1)<<(xx%32);known[index]|=bit;if(dilate?bits==oneBits:bits==0)dominant[index]|=bit;}
 ssg_n4_bitline(known,dominant,nextKnown,nextDominant,pw,ph,1,0,a);ssg_n4_bitline(nextKnown,nextDominant,known,dominant,pw,ph,0,1,a);ssg_n4_bitline(known,dominant,nextKnown,nextDominant,pw,ph,1,1,b);ssg_n4_bitline(nextKnown,nextDominant,known,dominant,pw,ph,1,-1,b);
 double neutral;std::memcpy(&neutral,&neutralBits,8);
 for(int y=0;y<h;y++)for(int x=0;x<w;x++){const int xx=x+pad;const size_t index=size_t(y+pad)*stride+xx/32;const uint32_t bit=uint32_t(1)<<(xx%32);out[size_t(y)*w+x]=(known[index]&bit)?(dilate?((dominant[index]&bit)?1.0:0.0):((dominant[index]&bit)?0.0:1.0)):neutral;}
 return true;
}

// Strict-fragment transport around the pinned D2PRL half arithmetic.
// The included source retains its author/reference notices and numerical
// order. Fragment storage is separate; no RGB gap is supplied to a CNN.
#include "table-simd4-exact-subnormal-tiled.cpp"

static bool strict_sample(float x,float y,int side,int* indices,float* weights) {
 if(!std::isfinite(x)||!std::isfinite(y)||x<0||y<0||x>side-1||y>side-1)return false;
 const float extent=(side-1)*.5f;
 const float gx=half((x-extent)/extent),gy=half((y-extent)/extent);
 const float px=((gx+1.f)*.5f)*(side-1),py=((gy+1.f)*.5f)*(side-1);
 const int x0=int(std::floor(px)),y0=int(std::floor(py)),x1=x0+1,y1=y0+1;
 const int xs[4]={x0,x1,x0,x1},ys[4]={y0,y0,y1,y1};
 weights[0]=(x1-px)*(y1-py);weights[1]=(px-x0)*(y1-py);weights[2]=(x1-px)*(py-y0);weights[3]=(px-x0)*(py-y0);
 for(int k=0;k<4;k++)indices[k]=xs[k]>=0&&xs[k]<side&&ys[k]>=0&&ys[k]<side?ys[k]*side+xs[k]:-1;
 return true;
}
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_strict_supports(const float* x,const float* y,int count,int side,int* indices) {
 if(!x||!y||!indices||count<1||side<2||side>448)return 0;
 initialize_descriptor_decode_table();
 for(int i=0;i<count;i++){float weights[4];if(!strict_sample(x[i],y[i],side,indices+i*4,weights))return 0;}
 return 1;
}
// Source tensor is native CHW. Target corners are packed as
// [candidate,tile-position,channel,corner], losslessly gathered from their
// actual fragment bank using d2prl_strict_supports. Only valid candidates are
// read. Scalar tails still depend on ORIGINAL source indices and thread layout.
static int strict_tile(
 const H* source,const H* corners,const int* corner_offsets,const H* const* resident,int resident_count,const float* tx,const float* ty,
 const float* offsets_x,const float* offsets_y,const uint8_t* valid,
 const float* original_x,const float* original_y,
 int side,int channels,int candidates,int begin,int end,int reference_threads,
 float min_x,float min_y,float max_x,float max_y,float* result_x,float* result_y) {
 if(!source||!corners||!tx||!ty||!offsets_x||!offsets_y||!valid||!original_x||!original_y||!result_x||!result_y||side<2||side>448||(channels!=36&&channels!=96)||candidates<1||candidates>13||begin<0||end<begin||end>side*side||reference_threads<1||reference_threads>32||!(max_x>=min_x&&max_y>=min_y))return 0;
 initialize_descriptor_decode_table();
 const int n=side*side,count=end-begin,group=channels/3;
 for(int at=0;at<count;at++){
  const int index=begin+at;float values[96],scores[13],expv[13],weights[13];int slots[13],kept=0;
  for(int candidate=0;candidate<candidates;candidate++){
   const int position=candidate*count+at;if(!valid[position])continue;
   int indices[4];float interpolation[4];if(!strict_sample(tx[position],ty[position],side,indices,interpolation))return 0;
   for(int channel=0;channel<channels;channel++){
    const int location=corner_offsets?corner_offsets[position]:position*channels*4;
    const bool resident_target=corner_offsets&&location<0;
    const H* bank=source;
    if(location<-1){const int slot=-location-2;if(!resident||slot<0||slot>=resident_count||!resident[slot])return 0;bank=resident[slot];}
    const H* input=resident_target?bank+channel*n:corners+location+channel*4;float value=0;
    for(int k=0;k<4;k++)if(indices[k]>=0)value+=fromhalf(input[resident_target?indices[k]:k])*interpolation[k];
    values[channel]=half(value);
   }
   float best=-INFINITY;
   for(int shift=0;shift<3;shift++)for(int block=0;block<3;block++){
    float sum=0;for(int j=0;j<group;j++){const int channel=block*group+j,other=(channel-shift*group+channels)%channels;sum+=-std::abs(half(fromhalf(source[channel*n+index])-values[other]));}
    best=std::max(best,half(sum/group));
   }
   slots[kept]=candidate;scores[kept++]=half(best*1000.f);
  }
  if(!kept){result_x[at]=0;result_y[at]=0;continue;}
  const int chunk=(n+reference_threads-1)/reference_threads,start=(index/chunk)*chunk,length=std::min(chunk,n-start);
  if(index-start>=length/8*8){float maximum=-INFINITY,denominator=0;for(int k=0;k<kept;k++)maximum=std::max(maximum,scores[k]);for(int k=0;k<kept;k++){const float value=std::exp(scores[k]-maximum);denominator+=value;expv[k]=half(value);}for(int k=0;k<kept;k++)weights[k]=half(expv[k]/denominator);}
  else d2prl_softmax_probe(scores,kept,expv,weights);
  float wx[13],wy[13];for(int k=0;k<kept;k++){const int position=slots[k]*count+at;wx[k]=offsets_x[position]*weights[k];wy[k]=offsets_y[position]*weights[k];}
  float x=0,y=0;
  if(index>=n/16*16){float sx[4]={},sy[4]={};const int grouped=kept/4*4;for(int k=0;k<grouped;k++){sx[k%4]+=wx[k];sy[k%4]+=wy[k];}for(int k=grouped;k<kept;k++){sx[0]+=wx[k];sy[0]+=wy[k];}x=((sx[0]+sx[1])+sx[2])+sx[3];y=((sy[0]+sy[1])+sy[2])+sy[3];}
  else for(int k=0;k<kept;k++){x+=wx[k];y+=wy[k];}
  result_x[at]=std::clamp(x+original_x[at],min_x,max_x)-original_x[at];result_y[at]=std::clamp(y+original_y[at],min_y,max_y)-original_y[at];
 }
 return 1;
}

// Historical full-packed ABI remains available as the arithmetic oracle.
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_strict_packed_tile(
 const H* source,const H* corners,const float* tx,const float* ty,
 const float* offsets_x,const float* offsets_y,const uint8_t* valid,
 const float* original_x,const float* original_y,
 int side,int channels,int candidates,int begin,int end,int reference_threads,
 float min_x,float min_y,float max_x,float max_y,float* result_x,float* result_y) {
 return strict_tile(source,corners,nullptr,nullptr,0,tx,ty,offsets_x,offsets_y,valid,original_x,original_y,side,channels,candidates,begin,end,reference_threads,min_x,min_y,max_x,max_y,result_x,result_y);
}
// A -1 slot reads its target directly from the already resident source CHW.
// Nonnegative slots index compact [channel,corner] blocks belonging to real
// foreign fragments. Neither local targets nor rejected targets are transported.
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_strict_hybrid_tile(
 const H* source,const H* corners,const int* corner_offsets,const float* tx,const float* ty,
 const float* offsets_x,const float* offsets_y,const uint8_t* valid,
 const float* original_x,const float* original_y,
 int side,int channels,int candidates,int begin,int end,int reference_threads,
 float min_x,float min_y,float max_x,float max_y,float* result_x,float* result_y) {
 if(!corner_offsets)return 0;
 return strict_tile(source,corners,corner_offsets,nullptr,0,tx,ty,offsets_x,offsets_y,valid,original_x,original_y,side,channels,candidates,begin,end,reference_threads,min_x,min_y,max_x,max_y,result_x,result_y);
}

// Resident foreign banks retain the same CHW bits and interpolation arithmetic.
// -1 is this source; -2-slot names a separately published foreign bank; nonnegative
// offsets retain the historical packed fallback. No ownership is inferred from RGB.
extern "C" EMSCRIPTEN_KEEPALIVE int d2prl_strict_resident_tile(
 const H* source,const H* corners,const int* corner_offsets,const H* const* resident,int resident_count,const float* tx,const float* ty,
 const float* offsets_x,const float* offsets_y,const uint8_t* valid,
 const float* original_x,const float* original_y,
 int side,int channels,int candidates,int begin,int end,int reference_threads,
 float min_x,float min_y,float max_x,float max_y,float* result_x,float* result_y) {
 if(!corner_offsets||resident_count<0||resident_count>1||(!resident&&resident_count))return 0;
 return strict_tile(source,corners,corner_offsets,resident,resident_count,tx,ty,offsets_x,offsets_y,valid,original_x,original_y,side,channels,candidates,begin,end,reference_threads,min_x,min_y,max_x,max_y,result_x,result_y);
}

// Private phase extraction from the pinned native bridge.cpp reverse loop.
// Same operand order, float32 operations, strict tie and live target traversal.
#include <cstdint>
#include <cmath>
template<bool Early> static void reverse_phase(const float* first,const float* second,
 const unsigned char* mask,int width,int height,int dimensions,int compare,
 float minimum,float maximum,int* matches,float* distances,uint32_t* counts,int stride,int begin=0,int end=-1) {
 #pragma clang fp contract(off)
 const int count=width*height;const double lo=double(minimum)*minimum,hi=double(maximum)*maximum;
 auto allowed=[&](int i,int j){
  if(j<0||j>=count||i==j||!mask[i]||!mask[j])return false;
  if(compare&&!(((mask[i]&1)&&(mask[j]&2))||((mask[i]&2)&&(mask[j]&1))))return false;
  const double dx=i%width-j%width,dy=i/width-j/width,d=dx*dx+dy*dy;return d>=lo&&d<=hi;
 };
 auto offer=[&](int i,int j){
  if(!allowed(i,j))return;
  ++counts[i*stride];
  if(Early&&(matches[i*stride]==j||distances[i*stride]==0.f))return;
  const float* a=first+size_t(i)*dimensions;const float* b=second+size_t(j)*dimensions;
  float distance=0;const float best=distances[i*stride];
  if(Early){for(int start=0;start<dimensions;start+=16){const int end=start+16<dimensions?start+16:dimensions;for(int k=start;k<end;++k){const float d=a[k]-b[k];distance+=d*d;}if(distance>=best)break;}}
  else for(int k=0;k<dimensions;++k){const float d=a[k]-b[k];distance+=d*d;}
  if(distance<distances[i*stride]){distances[i*stride]=distance;matches[i*stride]=j;}
 };
 for(int i=begin;i<(end<0?count:end);++i)if(matches[i*stride]>=0)offer(matches[i*stride],i);
}
extern "C" void dense_reverse(const float* first,const float* second,const unsigned char* mask,
 int width,int height,int dimensions,int compare,float minimum,float maximum,
 int* matches,float* distances,uint32_t* counts){
 if(dimensions==128)reverse_phase<true>(first,second,mask,width,height,dimensions,compare,minimum,maximum,matches,distances,counts,1);
 else reverse_phase<false>(first,second,mask,width,height,dimensions,compare,minimum,maximum,matches,distances,counts,1);
}

extern "C" void dense_reverse_state(const float* first,const float* second,const unsigned char* mask,
 int width,int height,int dimensions,int compare,float minimum,float maximum,uint32_t* state){
 if(dimensions==128)reverse_phase<true>(first,second,mask,width,height,dimensions,compare,minimum,maximum,reinterpret_cast<int*>(state),reinterpret_cast<float*>(state+1),state+2,4);
 else reverse_phase<false>(first,second,mask,width,height,dimensions,compare,minimum,maximum,reinterpret_cast<int*>(state),reinterpret_cast<float*>(state+1),state+2,4);
}

extern "C" void dense_reverse_state_range(const float* first,const float* second,const unsigned char* mask,
 int width,int height,int dimensions,int compare,float minimum,float maximum,uint32_t* state,int begin,int end){
 if(dimensions==128)reverse_phase<true>(first,second,mask,width,height,dimensions,compare,minimum,maximum,reinterpret_cast<int*>(state),reinterpret_cast<float*>(state+1),state+2,4,begin,end);
 else reverse_phase<false>(first,second,mask,width,height,dimensions,compare,minimum,maximum,reinterpret_cast<int*>(state),reinterpret_cast<float*>(state+1),state+2,4,begin,end);
}

// Native bridge metric; original integer-axis exports above stay unchanged.
template<bool Early> static void reverse_phase_metric(const float* first,const float* second,
 const unsigned char* mask,int width,int height,int dimensions,int compare,
 float minimum,float maximum,float gapx,float gapy,const float* xmap,const float* ymap,int* matches,float* distances,uint32_t* counts,int stride,int begin=0,int end=-1) {
 #pragma clang fp contract(off)
 const int count=width*height;const double lo=double(minimum)*minimum,hi=double(maximum)*maximum;
 auto allowed=[&](int i,int j){
  if(j<0||j>=count||i==j||!mask[i]||!mask[j])return false;
  if(compare&&!(((mask[i]&1)&&(mask[j]&2))||((mask[i]&2)&&(mask[j]&1))))return false;
  double dx=xmap?double(xmap[i%width])-xmap[j%width]:i%width-j%width;
  double dy=ymap?double(ymap[i/width])-ymap[j/width]:i/width-j/width;
  if(compare){double sign=((mask[i]&1)&&(mask[j]&2))?1.:-1.;dx+=sign*gapx;dy+=sign*gapy;}
  double d=dx*dx+dy*dy;return d>=lo&&d<=hi;
 };
 auto offer=[&](int i,int j){
  if(!allowed(i,j))return;
  ++counts[i*stride];
  if(Early&&(matches[i*stride]==j||distances[i*stride]==0.f))return;
  const float* a=first+size_t(i)*dimensions;const float* b=second+size_t(j)*dimensions;
  float distance=0;const float best=distances[i*stride];
  if(Early){for(int start=0;start<dimensions;start+=16){const int end=start+16<dimensions?start+16:dimensions;for(int k=start;k<end;++k){const float d=a[k]-b[k];distance+=d*d;}if(distance>=best)break;}}
  else for(int k=0;k<dimensions;++k){const float d=a[k]-b[k];distance+=d*d;}
  if(distance<distances[i*stride]){distances[i*stride]=distance;matches[i*stride]=j;}
 };
 for(int i=begin;i<(end<0?count:end);++i)if(matches[i*stride]>=0)offer(matches[i*stride],i);
}
extern "C" void dense_reverse_state_metric_range(const float* first,const float* second,const unsigned char* mask,
 int width,int height,int dimensions,int compare,float minimum,float maximum,float gapx,float gapy,const float* xmap,const float* ymap,uint32_t* state,int begin,int end){
 if(dimensions==128)reverse_phase_metric<true>(first,second,mask,width,height,dimensions,compare,minimum,maximum,gapx,gapy,xmap,ymap,reinterpret_cast<int*>(state),reinterpret_cast<float*>(state+1),state+2,4,begin,end);
 else reverse_phase_metric<false>(first,second,mask,width,height,dimensions,compare,minimum,maximum,gapx,gapy,xmap,ymap,reinterpret_cast<int*>(state),reinterpret_cast<float*>(state+1),state+2,4,begin,end);
}

// Internal producer-qualified path only: identical descriptor banks and a
// native-exact distance for each current target. IDs, live traversal and ties
// remain native. Diagnostic/caller-mutated states must use the exports above.
template<bool Early> static void reverse_phase_symmetric(const unsigned char* mask,
 int width,int height,int compare,float minimum,float maximum,float gapx,float gapy,
 const float* xmap,const float* ymap,uint32_t* state,int begin,int end){
 #pragma clang fp contract(off)
 const int count=width*height;const double lo=double(minimum)*minimum,hi=double(maximum)*maximum;
 int* matches=reinterpret_cast<int*>(state);float* distances=reinterpret_cast<float*>(state+1);uint32_t* counts=state+2;
 auto allowed=[&](int i,int j){
  if(j<0||j>=count||i==j||!mask[i]||!mask[j])return false;
  if(compare&&!(((mask[i]&1)&&(mask[j]&2))||((mask[i]&2)&&(mask[j]&1))))return false;
  double dx=xmap?double(xmap[i%width])-xmap[j%width]:i%width-j%width;
  double dy=ymap?double(ymap[i/width])-ymap[j/width]:i/width-j/width;
  if(compare){double sign=((mask[i]&1)&&(mask[j]&2))?1.:-1.;dx+=sign*gapx;dy+=sign*gapy;}
  const double d=dx*dx+dy*dy;return d>=lo&&d<=hi;
 };
 for(int i=begin;i<end;i++){
  const int j=matches[i*4];if(j<0||!allowed(j,i))continue;
  const float distance=distances[i*4];++counts[j*4];
  if(Early&&(matches[j*4]==i||distances[j*4]==0.f))continue;
  if(distance<distances[j*4]){distances[j*4]=distance;matches[j*4]=i;}
 }
}
extern "C" void dense_reverse_state_symmetric_range(const unsigned char* mask,int width,int height,int dimensions,int compare,
 float minimum,float maximum,float gapx,float gapy,const float* xmap,const float* ymap,uint32_t* state,int begin,int end){
 if(dimensions==128)reverse_phase_symmetric<true>(mask,width,height,compare,minimum,maximum,gapx,gapy,xmap,ymap,state,begin,end);
 else reverse_phase_symmetric<false>(mask,width,height,compare,minimum,maximum,gapx,gapy,xmap,ymap,state,begin,end);
}

extern "C" int dense_reverse_active_map(const unsigned char* mask,const int* indices,int count,int active_count,int* native_to_slot){
 if(count<2||active_count<2||active_count>count)return -1;
 for(int i=0;i<count;i++)native_to_slot[i]=-1;
 for(int slot=0;slot<active_count;slot++){const int i=indices[slot];if(i<0||i>=count||(slot&&i<=indices[slot-1])||!mask[i])return -1;native_to_slot[i]=slot;}
 for(int i=0;i<count;i++)if(mask[i]>3||((mask[i]>0)!=(native_to_slot[i]>=0)))return -1;
 return 1;
}
extern "C" int dense_reverse_active_validate(const int* native_to_slot,int native_count,int active_count,const uint32_t* state){
 for(int slot=0;slot<active_count;slot++){const int j=static_cast<int32_t>(state[slot*4]);if(j>=0&&(j>=native_count||native_to_slot[j]<0||native_to_slot[j]>=active_count))return -1;}
 return 1;
}
template<bool Early,bool Symmetric=false> static int dense_reverse_active_phase(const float* first,const float* second,
 const unsigned char* mask,const int* indices,const int* native_to_slot,int width,int height,int active_count,int dimensions,int compare,
 float minimum,float maximum,float gapx,float gapy,const float* xmap,const float* ymap,uint32_t* state,int begin,int end){
 #pragma clang fp contract(off)
 const int count=width*height;const double lo=double(minimum)*minimum,hi=double(maximum)*maximum;
 if(begin<0||end<begin||end>active_count)return -1;
 auto allowed=[&](int i,int j){
  if(i<0||i>=count||j<0||j>=count||i==j||!mask[i]||!mask[j])return false;
  if(compare&&!(((mask[i]&1)&&(mask[j]&2))||((mask[i]&2)&&(mask[j]&1))))return false;
  double dx=xmap?double(xmap[i%width])-xmap[j%width]:i%width-j%width;
  double dy=ymap?double(ymap[i/width])-ymap[j/width]:i/width-j/width;
  if(compare){double sign=((mask[i]&1)&&(mask[j]&2))?1.:-1.;dx+=sign*gapx;dy+=sign*gapy;}
  double d=dx*dx+dy*dy;return d>=lo&&d<=hi;
 };
 auto offer=[&](int i,int j,float native_source_distance){
  if(!allowed(i,j))return;
  const int a_slot=native_to_slot[i],b_slot=native_to_slot[j];if(a_slot<0||b_slot<0)return;
  uint32_t* counts=state+2;int* matches=reinterpret_cast<int*>(state);float* distances=reinterpret_cast<float*>(state+1);
  ++counts[a_slot*4];
  if(Early&&(matches[a_slot*4]==j||distances[a_slot*4]==0.f))return;
  const float* a=Symmetric?nullptr:first+size_t(a_slot)*dimensions;const float* b=Symmetric?nullptr:second+size_t(b_slot)*dimensions;
  float distance=0;const float best=distances[a_slot*4];
  if(Symmetric)distance=native_source_distance;
  else if(Early){for(int start=0;start<dimensions;start+=16){const int end=start+16<dimensions?start+16:dimensions;for(int k=start;k<end;++k){const float d=a[k]-b[k];distance+=d*d;}if(distance>=best)break;}}
  else for(int k=0;k<dimensions;++k){const float d=a[k]-b[k];distance+=d*d;}
  if(distance<distances[a_slot*4]){distances[a_slot*4]=distance;matches[a_slot*4]=j;}
 };
 for(int slot=begin;slot<end;slot++){const int i=indices[slot],j=static_cast<int32_t>(state[slot*4]);if(j>=0)offer(j,i,reinterpret_cast<float*>(state+1)[slot*4]);}
 return 1;
}
extern "C" int dense_reverse_state_active_range(const float* first,const float* second,const unsigned char* mask,const int* indices,const int* native_to_slot,
 int width,int height,int active_count,int dimensions,int compare,float minimum,float maximum,float gapx,float gapy,const float* xmap,const float* ymap,uint32_t* state,int symmetric,int begin,int end){
 if(dimensions==128){if(symmetric)return dense_reverse_active_phase<true,true>(first,second,mask,indices,native_to_slot,width,height,active_count,dimensions,compare,minimum,maximum,gapx,gapy,xmap,ymap,state,begin,end);return dense_reverse_active_phase<true,false>(first,second,mask,indices,native_to_slot,width,height,active_count,dimensions,compare,minimum,maximum,gapx,gapy,xmap,ymap,state,begin,end);}
 if(dimensions==12){if(symmetric)return dense_reverse_active_phase<false,true>(first,second,mask,indices,native_to_slot,width,height,active_count,dimensions,compare,minimum,maximum,gapx,gapy,xmap,ymap,state,begin,end);return dense_reverse_active_phase<false,false>(first,second,mask,indices,native_to_slot,width,height,active_count,dimensions,compare,minimum,maximum,gapx,gapy,xmap,ymap,state,begin,end);}
 return -2;
}

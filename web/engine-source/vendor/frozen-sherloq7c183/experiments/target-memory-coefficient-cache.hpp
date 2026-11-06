#pragma once
// Exact memoization. Keys contain the binary64 arguments, not rounded levels.
// Entries borrow already-funded unused arena space; no cache heap is allocated.
struct ExactCoefficientCache {
 struct Value {double w,wanted,fidelity;};
 struct Entry {uint64_t difference,mass;Value value;};
 Entry*entries=nullptr;uint8_t*next=nullptr;uint32_t sets=0;
 mutable uint64_t calls=0,hits=0;uint64_t bytes=0;bool enabled=false;
 void reset(uint8_t*arena,uint64_t extent,uint64_t used,uint64_t edges){
  calls=hits=0;enabled=false;bytes=0;
  if(!edges||!arena)return;
  sets=64;while(sets<16384&&uint64_t(sets)*4<edges)sets*=2;
  const uint64_t capacity=uint64_t(sets)*4,payload=capacity*sizeof(Entry)+sets;
  if(extent<payload+8)return;
  const uint64_t start=(extent-payload)&~uint64_t(7);
  if(start<used)return;
  entries=reinterpret_cast<Entry*>(arena+start);next=reinterpret_cast<uint8_t*>(entries+capacity);
  for(uint64_t i=0;i<capacity;i++)entries[i].difference=0;
  std::memset(next,0,sets);bytes=extent-start;enabled=true;
 }
 template<class Compute>Value get(double difference,double mass,Compute compute)const{
  calls++;if(!enabled)return compute();uint64_t d,m;
  std::memcpy(&d,&difference,8);std::memcpy(&m,&mass,8);
  if(!d)return compute();
  uint64_t h=d^(m+0x9e3779b97f4a7c15ULL+(d<<6)+(d>>2));
  h^=h>>33;h*=0xff51afd7ed558ccdULL;h^=h>>33;
  const uint32_t bucket=uint32_t(h)&(sets-1),base=bucket*4;
  for(uint32_t way=0;way<4;way++){const auto&e=entries[base+way];if(e.difference==d&&e.mass==m){hits++;return e.value;}}
  const Value value=compute();auto&e=entries[base+(next[bucket]++&3)];e.difference=d;e.mass=m;e.value=value;return value;
 }
};

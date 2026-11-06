#pragma once
// Lossless bit-pattern palette of the historical Float64 edge multiplicities.
// The phase8 collector borrows dead refine scratch; persistent data borrows
// already-funded dead arena tail and never owns an N/E-sized allocation.
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <limits>
struct NativeMassPalette {
 static constexpr uint32_t maximum=65536,scratchSlots=131072;
 uint8_t*collectorHash=nullptr;double*collectorValues=nullptr;
 const double*values=nullptr;const uint8_t*lookup=nullptr;
 uint32_t count=0,lookupMask=0;uint64_t bytes=0,start=0;
 bool started=false,overflow=false,ready=false;
 static uint64_t bits(double value){uint64_t b;std::memcpy(&b,&value,8);return b;}
 static uint32_t indexAt(const uint8_t*base,uint32_t slot){uint32_t value;std::memcpy(&value,base+4ULL*slot,4);return value;}
 static void setIndex(uint8_t*base,uint32_t slot,uint32_t value){std::memcpy(base+4ULL*slot,&value,4);}
 static uint32_t hash(uint64_t b){uint32_t h=uint32_t(b)^uint32_t(b>>32);h^=h>>16;h*=0x7feb352dU;h^=h>>15;h*=0x846ca68bU;h^=h>>16;return h;}
 void begin(double*scratch){
  count=0;bytes=start=0;overflow=ready=false;values=nullptr;lookup=nullptr;lookupMask=0;started=scratch!=nullptr;
  collectorHash=reinterpret_cast<uint8_t*>(scratch);collectorValues=scratch?scratch+65536:nullptr;
  if(started)std::memset(collectorHash,0,4ULL*scratchSlots);
 }
 void observe(double value){
  if(!started||overflow)return;const uint64_t key=bits(value);uint32_t slot=hash(key)&(scratchSlots-1);
  for(uint32_t probe=0;probe<scratchSlots;probe++,slot=(slot+1)&(scratchSlots-1)){
   const uint32_t entry=indexAt(collectorHash,slot);
   if(entry){if(entry>count){overflow=true;return;}if(bits(collectorValues[entry-1])==key)return;continue;}
   if(count==maximum){overflow=true;return;}
   std::memcpy(collectorValues+count,&value,8);setIndex(collectorHash,slot,++count);return;
  }
  overflow=true;
 }
 bool persist(uint8_t*arena,uint64_t extent,uint64_t used){
  ready=false;values=nullptr;lookup=nullptr;bytes=start=0;lookupMask=0;
  if(!started||overflow||!count||!arena){collectorHash=nullptr;collectorValues=nullptr;return false;}
  uint32_t slots=2;while(slots<2*count)slots*=2;
  const uint64_t payload=8ULL*count+4ULL*slots;
  if(extent<payload+7){collectorHash=nullptr;collectorValues=nullptr;return false;}
  const uint64_t at=(extent-payload)&~uint64_t(7);
  if(at<used){collectorHash=nullptr;collectorValues=nullptr;return false;}
  auto*saved=reinterpret_cast<double*>(arena+at);auto*table=arena+at+8ULL*count;
  std::memcpy(saved,collectorValues,8ULL*count);std::memset(table,0,4ULL*slots);
  for(uint32_t i=0;i<count;i++){
   const uint64_t key=bits(saved[i]);uint32_t slot=hash(key)&(slots-1);
   while(indexAt(table,slot)){if(bits(saved[indexAt(table,slot)-1])==key){collectorHash=nullptr;collectorValues=nullptr;return false;}slot=(slot+1)&(slots-1);}
   setIndex(table,slot,i+1);
  }
  collectorHash=nullptr;collectorValues=nullptr;values=saved;lookup=table;lookupMask=slots-1;start=at;bytes=extent-at;ready=true;return true;
 }
 uint64_t cacheExtent(uint64_t extent)const{return ready?std::min(extent,start):extent;}
 uint32_t bytesPerEdge()const{return ready?(count<=256?1:2):8;}
 bool find(double value,uint32_t&code)const{
  if(!ready)return false;const uint64_t key=bits(value);uint32_t slot=hash(key)&lookupMask;
  for(uint32_t probe=0;probe<=lookupMask;probe++,slot=(slot+1)&lookupMask){const uint32_t entry=indexAt(lookup,slot);if(!entry)return false;if(entry>count)return false;if(bits(values[entry-1])==key){code=entry-1;return true;}}
  return false;
 }
 double decode(uint32_t code)const{return ready&&code<count?values[code]:std::numeric_limits<double>::quiet_NaN();}
};

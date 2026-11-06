// GPL-3.0-or-later. Global native PatchMatch traversal over bounded page caches.
#include <emscripten.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <vector>
#include <memory>
EM_JS(int, page_io_start, (int store, double offset, int bytes, void* pointer, int write), {
 try { const result=Module.pageIO(store, offset, bytes, pointer, !!write);
  if(result && typeof result.then==='function'){Module.pendingPageIO=result;return 1;}return 0;
 }catch(error){Module.ioError=error;return -1;}
});
EM_ASYNC_JS(int, page_io_wait, (), {
 try {await Module.pendingPageIO;Module.pendingPageIO=null;return 0;}
 catch(error){Module.pendingPageIO=null;Module.ioError=error;return 1;}
});
// OPFS sync handles and resident arrays finish immediately. Do not unwind the
// native traversal for each byte page; IndexedDB and cooperative yields retain
// the asynchronous path, including the original storage error identity.
static int page_io(int store,double offset,int bytes,void* pointer,int write){
 int result=page_io_start(store,offset,bytes,pointer,write);
 return result==1?page_io_wait():result<0?1:0;
}
EM_ASYNC_JS(int, checkpoint, (), {
 try { await Module.checkpoint(); return 0; }
 catch(error) { Module.ioError = error; return 1; }
});
static void check() { if(checkpoint()) throw std::runtime_error("Page operation cancelled"); }
// Each store has its own direct-mapped cache. Values, never cache references,
// cross another cache lookup. All offsets in the external plane use 64 bits.
class Pages {
 struct Slot { uint64_t tag=UINT64_MAX; bool dirty=false; int first=0,last=0; };
 int id, bytes, slots; uint64_t length; bool finite;
 std::vector<Slot> tags; std::vector<unsigned char> data;
 void save(int s) {
  auto& tag=tags[s]; if(!tag.dirty)return;
  uint64_t at=tag.tag*bytes+tag.first; int size=tag.last-tag.first;
  if(page_io(id,double(at),size,data.data()+size_t(s)*bytes+tag.first,1))throw std::runtime_error("Page write failed");
  tag.dirty=false;
 }
 unsigned char* access(uint64_t at,bool write,int size=0) {
  uint64_t page=at/bytes; int s=int(page%slots); auto& tag=tags[s];
  if(tag.tag!=page){save(s); tag.tag=UINT64_MAX;
   uint64_t offset=page*bytes; int size=int(std::min<uint64_t>(bytes,length-offset));
   if(page_io(id,double(offset),size,data.data()+size_t(s)*bytes,0))throw std::runtime_error("Page read failed");
   if(finite){const float* values=(const float*)(data.data()+size_t(s)*bytes);for(int k=0;k<size/4;k++)if(!std::isfinite(values[k]))throw std::runtime_error("Non-finite dense descriptor");}
   tag.tag=page;
  }
  if(write){const int begin=int(at%bytes),end=begin+size;if(tag.dirty){tag.first=std::min(tag.first,begin);tag.last=std::max(tag.last,end);}else{tag.first=begin;tag.last=end;}tag.dirty=true;}return data.data()+size_t(s)*bytes+at%bytes;
 }
 public:
 Pages(int id,uint64_t length,int bytes,int slots,bool finite=false):id(id),bytes(bytes),slots(std::min<uint64_t>(slots,(length+bytes-1)/bytes)),length(length),finite(finite),tags(this->slots),data(size_t(bytes)*this->slots){}
 template<class T> T get(uint64_t index){T value;std::memcpy(&value,access(index*sizeof(T),false),sizeof(T));return value;}
 template<class T> void set(uint64_t index,T value){std::memcpy(access(index*sizeof(T),true,sizeof(T)),&value,sizeof(T));}
 void floats(uint64_t offset,int count,float* out){
  uint64_t at=offset*4;int remaining=count*4;auto* dst=(unsigned char*)out;
  while(remaining){int size=std::min<uint64_t>(remaining,bytes-at%bytes);std::memcpy(dst,access(at,false),size);at+=size;dst+=size;remaining-=size;}
 }
 void flush(){for(int s=0;s<slots;++s)save(s);}
 void invalidate(){flush();for(auto& tag:tags)tag.tag=UINT64_MAX;}
 void resize_cache(int requested){
  const int next=int(std::min<uint64_t>(requested,(length+bytes-1)/bytes));if(next==slots)return;
  // Dirty output pages reach their owned stores before discarding cache slots.
  // Initial-batch vectors have already been destroyed when this is called.
  flush();std::vector<Slot> next_tags(next);std::vector<unsigned char> next_data(size_t(bytes)*next);
  // An optional cache allocation can fail after useful work. Publish only
  // after both buffers exist, leaving the previous reader fully usable.
  tags.swap(next_tags);data.swap(next_data);slots=next;
 }
};
template<class T> class Array:public Pages {
 public: Array(int id,uint64_t count,int bytes,int slots):Pages(id,count*sizeof(T),bytes,slots){}
 T get(uint64_t index){return Pages::get<T>(index);} void set(uint64_t index,T value){Pages::set<T>(index,value);}
};
EM_JS(int, pool_boot_size, (int side,int part), {const p=Module.fieldBoot.pools[side];return part===0?p.count:part===1?p.bits.byteLength:p.prefix.byteLength;});
EM_JS(void, pool_boot_copy, (int side,int part,void* target), {Module.HEAPU8.set(part===1?Module.fieldBoot.pools[side].bits:Module.fieldBoot.pools[side].prefix,target);});
EM_JS(void, pool_publish, (int side,int count,const void* bits,int bits_bytes,const void* prefix,int prefix_bytes), {if(!Module.fieldPools)Module.fieldPools=[];const copy=(at,size)=>{const out=typeof SharedArrayBuffer==='function'&&globalThis.crossOriginIsolated===true?new Uint8Array(new SharedArrayBuffer(size)):new Uint8Array(size);out.set(Module.HEAPU8.subarray(at,at+size));return out;};Module.fieldPools[side]={count,bits:copy(bits,bits_bytes),prefix:copy(prefix,prefix_bytes)};});
EM_ASYNC_JS(int, field_command, (int* command), {try{const values=await Module.nextFieldTask();Module.HEAPU32.set(values,command>>2);return 0;}catch(error){Module.ioError=error;return -1;}});
EM_JS(void, field_ready, (), {Module.fieldReady?.({pools:Module.fieldPools});});
EM_JS(int, field_has_distance_batch, (), {return typeof Module.distanceBatch==='function';});
EM_ASYNC_JS(int, field_distance_batch, (const float* query,const float* candidate,const float* best,int count,int dimensions,int distance_dimensions,float* result), {
 try{const view=(pointer,length)=>new Float32Array(Module.HEAPU8.buffer,pointer,length);const scores=await Module.distanceBatch({queryDescriptors:view(query,count*dimensions),candidateDescriptors:view(candidate,count*dimensions),best:view(best,count),pairCount:count,dimensions,distanceDimensions:distance_dimensions});if(scores===null){view(result,count).fill(NaN);return 0;}if(!(scores instanceof Float32Array)||scores.length!==count)throw Error('Invalid GPU distance bounds');for(const value of scores)if(value!==Infinity&&!Number.isNaN(value))throw Error('Uncertified GPU distance decision');view(result,count).set(scores);return 0;}catch(error){Module.ioError=error;return -1;}finally{Module.distanceBatchConsumed?.();}
});
EM_JS(void, field_task_done, (int phase,int begin,int end,uint32_t low,uint32_t high), {Module.fieldTaskDone({phase,begin,end,comparisons:BigInt(low)+(BigInt(high)<<32n)});});
class Pool {
 Array<int> values;uint32_t count=0;int length;bool resident;
 std::vector<uint64_t> bits;std::vector<uint32_t> prefix;
 public:Pool(int id,int length,int bytes,int slots,bool resident):values(id,resident?0:length,bytes,slots),length(length),resident(resident){}
 void add(int i){if(resident){if(bits.empty())bits.resize((uint64_t(length)+63)/64);bits[i/64]|=uint64_t(1)<<(i%64);}else values.set(count,i);count++;}
 void finish(){if(!resident||count==uint32_t(length)||!count)return;uint32_t sum=0;for(size_t i=0;i<bits.size();i+=16){prefix.push_back(sum);for(size_t j=i;j<std::min(i+16,bits.size());j++)sum+=__builtin_popcountll(bits[j]);}prefix.push_back(sum);}
 bool empty()const{return count==0;}uint32_t size()const{return count;}
 bool contains(int i)const{return count==uint32_t(length)||(!bits.empty()&&((bits[i/64]>>(i%64))&1));}
 int operator[](uint32_t index){if(count==uint32_t(length))return int(index);if(!resident)return values.get(index);
  size_t group=std::upper_bound(prefix.begin(),prefix.end(),index)-prefix.begin()-1;index-=prefix[group];size_t at=group*16;
  for(;;at++){unsigned n=__builtin_popcountll(bits[at]);if(index<n)break;index-=n;}uint64_t word=bits[at];while(index--)word&=word-1;return int(at*64+__builtin_ctzll(word));
 }
 void resize_cache(int slots){values.resize_cache(slots);}
 void restore(int side){count=uint32_t(pool_boot_size(side,0));bits.resize(pool_boot_size(side,1)/8);prefix.resize(pool_boot_size(side,2)/4);pool_boot_copy(side,1,bits.data());pool_boot_copy(side,2,prefix.data());}
 void publish(int side){pool_publish(side,count,bits.data(),int(bits.size()*8),prefix.data(),int(prefix.size()*4));}
};
EM_JS(void, field_progress, (int phase,int done,int total), {Module.fieldProgress={stage:phase<0?'sift-bounds':phase===0?'eligibility':phase===1?'initialization':phase%2?'reverse':'propagation',iteration:phase>=2?Math.floor((phase-2)/2):null,completed:done,total};});

EM_JS(void, bound_stats, (double count), {Module.siftBoundRejections=count;});
EM_JS(void, cache_allocation_failed, (int requested), {Module.cacheAllocationFailure?.(requested);});
extern "C" int dense_paged_field(int width,int height,int dimensions,int compare,float minimum,float maximum,int iterations,uint32_t seed,float gapx,float gapy,int axes,int page_bytes,int slots,uint64_t* comparisons,char* error,const int* metadata,const float* weights,int resident_pool,int initial_batch,int propagation_slots,int command_mode,int reverse_capacity,int symmetric){
 try {
  if(width<=0||height<=0||int64_t(width)*height>INT32_MAX||(dimensions!=12&&dimensions!=128)||page_bytes<512||page_bytes%8||slots<1||iterations<1||initial_batch<0)throw std::runtime_error("Invalid paged field");
  const int count=width*height;const bool Early=dimensions==128;
  auto full_count=[&](int side){return metadata?uint64_t(metadata[side*8])*metadata[side*8+1]:uint64_t(count);};
  auto descriptor_count=[&](int side){return metadata?uint64_t(metadata[side*8]-3*metadata[side*8+2])*(metadata[side*8+1]-3*metadata[side*8+2]):0;};
  Pages first(0,full_count(0)*(metadata?32:dimensions*4),page_bytes,slots,true),second(1,full_count(1)*(metadata?32:dimensions*4),page_bytes,slots,true);
  Pages* firstReader=&first;Pages* secondReader=&second;
  const int small_slots=std::max(1,(slots+7)/8);
  Array<unsigned char> mask(2,count,page_bytes,small_slots);
  Array<int> matches(3,count,page_bytes,small_slots);Array<float> distances(4,count,page_bytes,small_slots);
  Array<float> xmap(7,width,page_bytes,small_slots),ymap(8,height,page_bytes,small_slots);
  Array<float> norms_a(9,descriptor_count(0)*3,page_bytes,small_slots),norms_b(10,descriptor_count(1)*3,page_bytes,small_slots);
  Array<unsigned char> turns_a(11,descriptor_count(0),page_bytes,small_slots),turns_b(12,descriptor_count(1),page_bytes,small_slots),diverse_a(13,descriptor_count(0),page_bytes,small_slots),diverse_b(14,descriptor_count(1),page_bytes,small_slots);
  auto pixel=[&](int index,int side){const int* f=metadata+side*8;int x=index%width+f[3],y=index/width+f[3],dw=f[0]-3*f[2];if(f[5])x=dw-1-x;return uint64_t(y)*dw+x;};
  std::vector<unsigned char> sift_bounds;uint64_t bound_rejections=0;
  if(metadata&&(metadata[15]&2)){
   sift_bounds.resize(descriptor_count(1)*4);
   for(size_t at=0;at<sift_bounds.size();at+=1048576){field_progress(-1,int(at),int(sift_bounds.size()));check();int length=std::min<size_t>(1048576,sift_bounds.size()-at);if(page_io(15,double(at),length,sift_bounds.data()+at,0))throw std::runtime_error("SIFT bound read failed");}
  }
  Pages full_bounds(16,metadata&&(metadata[15]&4)?descriptor_count(1)*128:0,page_bytes,small_slots);
  const int decoded_slots=512;
  std::vector<int> decoded_ids(metadata?2*decoded_slots:0,-1);
  std::vector<unsigned char> decoded_parts(metadata?2*decoded_slots:0,0);
  std::vector<float> decoded_values(metadata?size_t(2)*decoded_slots*128:0);
  auto read_descriptor=[&](int index,int side,float* out,int begin=0,int length=0){
   if(!length)length=dimensions;
   Pages& hist=side?*secondReader:*firstReader;
   if(!metadata){hist.floats(uint64_t(index)*dimensions+begin,length,out+begin);return;}
   int slot=side*decoded_slots+(uint32_t(index)*2654435761u)%decoded_slots;
   float* cached=decoded_values.data()+size_t(slot)*128;
   if(decoded_ids[slot]!=index){decoded_ids[slot]=index;decoded_parts[slot]=0;}
   unsigned wanted=((1u<<(length/16))-1)<<(begin/16);
   if((decoded_parts[slot]&wanted)==wanted){std::copy_n(cached+begin,length,out+begin);return;}
   const int* f=metadata+side*8;auto& norms=side?norms_b:norms_a;auto& turns=side?turns_b:turns_a;uint64_t p=pixel(index,side);
   int x=p%(f[0]-3*f[2]),y=p/(f[0]-3*f[2]),turn=f[6]?turns.get(p):0;
   float norm[3]={norms.get(p*3),norms.get(p*3+1),norms.get(p*3+2)};
   for(int by=0;by<4;by++)for(int bx=0;bx<4;bx++){
    const int component=(by*4+bx)*8;
    if(component<begin||component>=begin+length)continue;
    int xx=bx,yy=by;if(turn==1){xx=3-by;yy=bx;}else if(turn==2){xx=3-bx;yy=3-by;}else if(turn==3){xx=by;yy=3-bx;}
    float values[8];hist.floats((uint64_t(y+yy*f[2])*f[0]+x+xx*f[2])*8,8,values);
    for(int bin=0;bin<8;bin++){float v=(weights[side*4+xx]*weights[side*4+yy])*values[(bin+2*turn)%8];v/=norm[0];if(v>.2f)v=.2f;v/=norm[1];v/=norm[2];out[(by*4+bx)*8+bin]=v;}
   }
   std::copy_n(out+begin,length,cached+begin);decoded_parts[slot]|=wanted;
  };
  if(axes){for(int i=0;i<width;i++){float v=xmap.get(i);if(!std::isfinite(v)||(i&&(v<xmap.get(i-1)||v-xmap.get(i-1)>1.0001f)))throw std::runtime_error("Invalid dense x axis");}
   for(int i=0;i<height;i++){float v=ymap.get(i);if(!std::isfinite(v)||(i&&(v<ymap.get(i-1)||v-ymap.get(i-1)>1.0001f)))throw std::runtime_error("Invalid dense y axis");}}
  const double lo=double(minimum)*minimum,hi=double(maximum)*maximum;
  Pool pool[2]={Pool(5,count,page_bytes,small_slots,resident_pool),Pool(6,count,page_bytes,small_slots,resident_pool)};
  if(command_mode!=2)for(int i=0;i<count;++i){
   if((i&4095)==0){field_progress(0,i,count);check();}
   if(metadata&&(metadata[6]||metadata[14])){
    if((metadata[6]&&!diverse_a.get(pixel(i,0)))||(metadata[14]&&!diverse_b.get(pixel(i,1))))mask.set(i,0);
   }
   if(mask.get(i)>3)throw std::runtime_error("Invalid dense mask");
   matches.set(i,-1);distances.set(i,std::numeric_limits<float>::infinity());if(mask.get(i)&1)pool[0].add(i);if(mask.get(i)&2)pool[1].add(i);
  }
  
  if(command_mode==2){pool[0].restore(0);pool[1].restore(1);}else{pool[0].finish();pool[1].finish();}
  if(command_mode){if(!resident_pool)throw std::runtime_error("Parallel fields require resident candidate pools");mask.flush();matches.flush();distances.flush();if(command_mode==1){pool[0].publish(0);pool[1].publish(1);}field_ready();}
  auto mask_at=[&](int i){return resident_pool?int(pool[0].contains(i))+2*int(pool[1].contains(i)):int(mask.get(i));};
  *comparisons=0;
  auto random=[](uint32_t& state){state^=state<<13;state^=state>>17;state^=state<<5;return state;};
  auto allowed=[&](int i,int j){
   if(j<0 || j>=count || i==j || !mask_at(i) || !mask_at(j))return false;
   if(compare && !(((mask_at(i)&1)&&(mask_at(j)&2))||((mask_at(i)&2)&&(mask_at(j)&1))))return false;
   double dx=axes?double(xmap.get(i%width))-xmap.get(j%width):i%width-j%width;
   double dy=axes?double(ymap.get(i/width))-ymap.get(j/width):i/width-j/width;
   if(compare){double sign=((mask_at(i)&1)&&(mask_at(j)&2))?1.:-1.;dx+=sign*gapx;dy+=sign*gapy;}
   double d=dx*dx+dy*dy;return d>=lo && d<=hi;
  };
  auto evaluate=[&](int i,int j,float best){
   float a[128],b[128];read_descriptor(i,0,a);
   if(!sift_bounds.empty()){
    const unsigned char* bounds=sift_bounds.data()+pixel(j,1)*4;const int components[4]={0,26,124,102};const int turn=metadata[14]?((bounds[0]>>7)|((bounds[1]>>7)<<1)):0;
    // Each term is a lower bound on one exact native squared difference.
    // Nonnegative float additions cannot reduce that term. Binary endpoints
    // and monotone float subtraction/squaring keep the rejection conservative.
    for(int k=0;k<4;k++){unsigned q=bounds[(k+turn)%4]&127;if(q==127||!std::isfinite(a[components[k]]))continue;
     float low=float(q)/128.f,high=float(q+1)/128.f,v=a[components[k]];
     float delta=v<low?low-v:v>high?v-high:0.f;
     if(delta*delta>=best){++bound_rejections;return best;}
    }
   }
   if(metadata&&(*reinterpret_cast<const volatile int*>(metadata+15)&4)){
    uint64_t p=pixel(j,1),at=p*128;float lower=0.f;
    const int turn=metadata[14]?(sift_bounds.empty()?int(turns_b.get(p)):((sift_bounds[p*4]>>7)|((sift_bounds[p*4+1]>>7)<<1))):0;
    alignas(float) unsigned char quantized[128];full_bounds.floats(at/4,32,reinterpret_cast<float*>(quantized));
    for(int k=0;k<128;k++){
     int x=(k/8)%4,y=k/32,xx=x,yy=y;if(turn==1){xx=3-y;yy=x;}else if(turn==2){xx=3-x;yy=3-y;}else if(turn==3){xx=y;yy=3-x;}
     unsigned q=quantized[(yy*4+xx)*8+(k%8+2*turn)%8];float delta=0.f;
     if(q!=255&&std::isfinite(a[k])){float low=float(q)/256.f,high=float(q+1)/256.f;delta=a[k]<low?low-a[k]:a[k]>high?a[k]-high:0.f;}
     // Same left-to-right float accumulation, with each nonnegative term
     // conservatively decreased. Monotonic rounding preserves the bound.
     lower+=delta*delta;
     if(lower>=best){++bound_rejections;return best;}
    }
   }
   float distance=0;
   // Nonnegative partial sums cannot beat the current best once they reach it.
   // Keep the original operation order and tie rule; only skip rejected tails.
   if(Early){
    #pragma clang fp contract(off)
    for(int start=0;start<dimensions;start+=16){
     int end=std::min(start+16,dimensions);
     // Build only the target components that this exact nonnegative partial
     // sum needs. Rejected tails cannot change the winning index or its score.
     read_descriptor(j,1,b,start,end-start);
     for(int k=start;k<end;++k){float d=a[k]-b[k];distance+=d*d;}
     if(distance>=best)break;
    }
   }else{
    read_descriptor(j,1,b);
    for(int k=0;k<dimensions;++k){float d=a[k]-b[k];distance+=d*d;}
   }
   return distance;
  };
  auto offer=[&](int i,int j){
   if(!allowed(i,j))return;
   ++*comparisons;
   if(matches.get(i)==j || distances.get(i)==0.f)return;
   const float distance=evaluate(i,j,distances.get(i));
   if(distance<distances.get(i)){distances.set(i,distance);matches.set(i,j);}
  };
  auto initialize=[&](int begin,int end){
  if(initial_batch>0){
   const int prefetch=metadata?65536:1048576,prefetch_slots=metadata?63:4;
   Pages source(0,full_count(0)*(metadata?32:dimensions*4),prefetch,prefetch_slots,true),target(1,full_count(1)*(metadata?32:dimensions*4),prefetch,prefetch_slots,true);
   firstReader=&source;secondReader=&target;
   struct Initial{int destination,offset;uint32_t state;int attempts;};
   for(int base=begin;base<end;){
    const int length=std::min(initial_batch,end-base);std::vector<float> descriptors(size_t(length)*dimensions),scores(length,std::numeric_limits<float>::infinity());std::vector<int> destinations(length,-1);std::vector<Initial> ordered;ordered.reserve(length);
    field_progress(1,base,count);check();
    for(int offset=0;offset<length;offset++){
     if((offset&4095)==0)check();int i=base+offset;if(!mask_at(i))continue;auto& candidates=pool[compare&&(mask_at(i)&1)?1:0];if(candidates.empty())continue;
     uint32_t state=seed^(uint32_t(i)+1)*2654435761u;if(!state)state=1;
     for(int attempt=0;attempt<64;attempt++){int j=candidates[random(state)%candidates.size()];if(allowed(i,j)){read_descriptor(i,0,descriptors.data()+size_t(offset)*dimensions);ordered.push_back({j,offset,state,attempt+1});break;}}
    }
    uint32_t ticks=0;std::sort(ordered.begin(),ordered.end(),[&](const Initial&a,const Initial&b){if((ticks++&65535)==0)check();return a.destination<b.destination;});
    size_t done=0;
    for(auto record:ordered){
     if((done++&4095)==0){field_progress(1,base+int(done*length/std::max<size_t>(ordered.size(),1)),count);check();}
     float values[128];read_descriptor(record.destination,1,values);const float* a=descriptors.data()+size_t(record.offset)*dimensions;float distance=0;
     for(int k=0;k<dimensions;k++){float d=a[k]-values[k];distance+=d*d;if(Early&&(k%16==15)&&!std::isfinite(distance))break;}
     ++*comparisons;
     if(distance<std::numeric_limits<float>::infinity()){destinations[record.offset]=record.destination;scores[record.offset]=distance;}
     else{
      // Overflowing finite descriptors can reject the first valid candidate.
      // Continue the exact per-pixel PRNG/attempt budget in that uncommon case.
      int i=base+record.offset;auto& candidates=pool[compare&&(mask_at(i)&1)?1:0];for(int attempt=record.attempts;attempt<64&&matches.get(i)<0;attempt++)offer(i,candidates[random(record.state)%candidates.size()]);destinations[record.offset]=matches.get(i);scores[record.offset]=distances.get(i);
     }
    }
    for(int offset=0;offset<length;offset++){if((offset&4095)==0)check();matches.set(base+offset,destinations[offset]);distances.set(base+offset,scores[offset]);}
    base+=length;
   }
   firstReader=&first;secondReader=&second;
  }else{
  for(int i=begin;i<end;++i){
   if((i&4095)==0){field_progress(1,i,count);check();}
   if(!mask_at(i))continue;
   auto& candidates=pool[compare && (mask_at(i)&1)?1:0];if(candidates.empty())continue;
   uint32_t state=seed ^ (uint32_t(i)+1)*2654435761u;if(!state)state=1;
   for(int attempt=0;attempt<64 && matches.get(i)<0;++attempt)offer(i,candidates[random(state)%candidates.size()]);
  }
  }
  };
  auto resize=[&](int requested){
   if(requested<=0||requested==slots)return;
   check();propagation_slots=requested;const int small=std::max(1,(propagation_slots+7)/8);
   try{first.resize_cache(propagation_slots);second.resize_cache(propagation_slots);
   mask.resize_cache(small);matches.resize_cache(small);distances.resize_cache(small);
   pool[0].resize_cache(small);pool[1].resize_cache(small);xmap.resize_cache(small);ymap.resize_cache(small);
   norms_a.resize_cache(small);norms_b.resize_cache(small);turns_a.resize_cache(small);turns_b.resize_cache(small);
   diverse_a.resize_cache(small);diverse_b.resize_cache(small);full_bounds.resize_cache(small);
   }catch(const std::bad_alloc&){cache_allocation_failed(requested);}
   // Each unchanged request is attempted once. A later grant may request a
   // new size; no CPU width, global budget, RNG or field value is changed.
   slots=requested;
  };
  const float removed_x=axes?width-1-(xmap.get(width-1)-xmap.get(0)):0.f;
  const float removed_y=axes?height-1-(ymap.get(height-1)-ymap.get(0)):0.f;
  const float search_max=maximum+std::max(std::abs(gapx)+removed_x,std::abs(gapy)+removed_y);
  auto propagate=[&](int iteration,int begin,int end){
   int sign=iteration%2?-1:1;
   for(int step=begin;step<end;++step){
    if((step&4095)==0){field_progress(2*iteration+2,step,count);check();}
    int i=sign>0?step:count-1-step;if(!mask_at(i))continue;
    int x=i%width,y=i/width;
    // Neighbor displacements and their first-order extrapolation.
    const int dxs[4]={-sign,0,-sign,sign},dys[4]={0,-sign,-sign,-sign};
    for(int n=0;n<4;++n){
     int nx=x+dxs[n],ny=y+dys[n];if(nx<0||nx>=width||ny<0||ny>=height)continue;
     int p=ny*width+nx,m=matches.get(p);if(m<0)continue;
     int tx=x+(m%width-nx),ty=y+(m/width-ny);
     if(tx>=0&&tx<width&&ty>=0&&ty<height)offer(i,ty*width+tx);
     int n2x=nx+dxs[n],n2y=ny+dys[n];if(n2x<0||n2x>=width||n2y<0||n2y>=height)continue;
     int q=n2y*width+n2x,m2=matches.get(q);if(m2<0)continue;
     tx=x+2*(m%width-nx)-(m2%width-n2x);ty=y+2*(m/width-ny)-(m2/width-n2y);
     if(tx>=0&&tx<width&&ty>=0&&ty<height)offer(i,ty*width+tx);
    }
    uint32_t state=seed ^ (uint32_t(i)+1)*2654435761u ^ (uint32_t(iteration)+1)*2246822519u;if(!state)state=1;
    int m=matches.get(i),cx=m<0?x:m%width,cy=m<0?y:m/width;
    for(int window=std::min(int(std::ceil(search_max)),std::max(width,height));window>=1;window/=2){
     int xmin=std::max({0,cx-window,int(std::ceil(x-search_max))}),xmax=std::min({width-1,cx+window,int(std::floor(x+search_max))});
     int ymin=std::max({0,cy-window,int(std::ceil(y-search_max))}),ymax=std::min({height-1,cy+window,int(std::floor(y+search_max))});
     if(xmin>xmax||ymin>ymax)continue;
     int tx=xmin+random(state)%(xmax-xmin+1),ty=ymin+random(state)%(ymax-ymin+1);offer(i,ty*width+tx);
    }
   }
  };
  auto reverse=[&](int iteration,int begin,int end){
   // Re-evaluate reverse descriptors too: reflection matching need not be symmetric.
   for(int i=begin;i<end;++i){
    if((i&4095)==0){field_progress(2*iteration+3,i,count);check();}
    if(matches.get(i)>=0)offer(matches.get(i),i);
   }
  };
  if(!command_mode){
   initialize(0,count);resize(propagation_slots);
   for(int iteration=0;iteration<iterations;iteration++){propagate(iteration,0,count);reverse(iteration,0,count);}
  }else{
   Array<int> reverse_targets(17,reverse_capacity,page_bytes,small_slots);Array<float> reverse_scores(18,reverse_capacity,page_bytes,small_slots);
   int command[7]={},previous_phase=-1,previous_end=-1,cache_epoch=0;
   for(;;){
    if(field_command(command))throw std::runtime_error("Parallel field stopped");
    const int phase=command[0],begin=command[1],end=command[2],iteration=command[3],reverse_base=command[5];
    if(phase==0)break;
    if(begin<0||end<begin||end>count||iteration<0||iteration>=iterations)throw std::runtime_error("Invalid field task");
    if(phase!=3||previous_phase!=3||begin!=previous_end){matches.invalidate();distances.invalidate();}reverse_targets.invalidate();reverse_scores.invalidate();
    if(cache_epoch!=command[6]){cache_epoch=command[6];slots=-1;}resize(command[4]);
    if(phase==1)initialize(begin,end);
    else if(phase==2)propagate(iteration,begin,end);
    else if(phase==4){
     // Every source in this window observes the same pre-window field. Discarded
     // tails remain >= the old best, hence >= every later (decreasing) best.
     if(!symmetric&&field_has_distance_batch()){
      // Certified GPU lower bounds need only a descriptor prefix. An uncertain
      // pair is refined by the unchanged native distance and accumulation order.
      const int prefix=metadata?16:dimensions;std::vector<int> ids;std::vector<float> query,candidate,best;
      ids.reserve(end-begin);query.reserve(size_t(end-begin)*prefix);candidate.reserve(size_t(end-begin)*prefix);best.reserve(end-begin);
      for(int i=begin;i<end;i++){if((i&4095)==0)check();int j=matches.get(i);reverse_targets.set(i-reverse_base,j);reverse_scores.set(i-reverse_base,std::numeric_limits<float>::infinity());if(j<0||!allowed(j,i)||matches.get(j)==i||distances.get(j)==0.f)continue;ids.push_back(i);best.push_back(distances.get(j));size_t offset=query.size();query.resize(offset+prefix);candidate.resize(offset+prefix);read_descriptor(j,0,query.data()+offset,0,prefix);read_descriptor(i,1,candidate.data()+offset,0,prefix);}
      std::vector<float> decisions(ids.size());if(!ids.empty()&&field_distance_batch(query.data(),candidate.data(),best.data(),int(ids.size()),prefix,dimensions,decisions.data()))throw std::runtime_error("GPU distance bound failed");
      for(size_t k=0;k<ids.size();k++)if(std::isnan(decisions[k])){int i=ids[k],j=reverse_targets.get(i-reverse_base);reverse_scores.set(i-reverse_base,evaluate(j,i,best[k]));}
     }else for(int i=begin;i<end;i++){if((i&4095)==0)check();int j=matches.get(i);reverse_targets.set(i-reverse_base,j);float d=std::numeric_limits<float>::infinity();if(j>=0&&allowed(j,i)&&matches.get(j)!=i&&distances.get(j)!=0.f)d=symmetric?distances.get(i):evaluate(j,i,distances.get(j));reverse_scores.set(i-reverse_base,d);}
    }else if(phase==3){
     // Ordered commits are required. A source changed by an earlier reverse
     // offer now points back to that offer's source. Its reciprocal cannot
     // improve that source: the source already held this score or a better one.
     for(int i=begin;i<end;i++){if((i&4095)==0)check();int j=matches.get(i);if(j<0||!allowed(j,i))continue;++*comparisons;if(j!=reverse_targets.get(i-reverse_base))continue;float d=reverse_scores.get(i-reverse_base);if(d<distances.get(j)){distances.set(j,d);matches.set(j,i);}}
    }else throw std::runtime_error("Unknown field task");
    matches.flush();distances.flush();reverse_targets.flush();reverse_scores.flush();previous_phase=phase;previous_end=end;
    field_task_done(phase,begin,end,uint32_t(*comparisons),uint32_t(*comparisons>>32));
   }
  }
  bound_stats(double(bound_rejections));
  matches.flush();distances.flush();if(metadata&&(metadata[6]||metadata[14]))mask.flush();return 0;
 }catch(const std::bad_alloc& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -2;}
 catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -1;}
}

// Global coherence. Finite-radius sums use complete exact integer prefixes in
// a bounded strip; connected components use an external global union forest.
extern "C" int dense_paged_coherence(int width,int height,float threshold,double error_threshold,int radius,int minimum,int page_bytes,int slots,char* error){
 try{
  if(width<=0||height<=0||int64_t(width)*height>INT32_MAX||radius<1||radius>6||minimum<1||page_bytes<512||page_bytes%8||slots<1)throw std::runtime_error("Invalid paged coherence settings");
  const int n=width*height;
  Array<int> targets(0,n,page_bytes,slots);
  Array<float> distances(1,n,page_bytes,slots),errors(3,n,page_bytes,slots);
  Array<unsigned char> selected(2,n,page_bytes,slots);
  int count=0,moment=0;for(int y=-radius;y<=radius;y++)for(int x=-radius;x<=radius;x++)if(x*x+y*y<=radius*radius){count++;moment+=x*x;}
  // For axes <= 2^20 these integer prefixes are below 2^53. Preserve the
  // original per-neighbor arithmetic for larger coordinate magnitudes.
  if(std::max(width,height)<=1048576){
   const int rows=2*radius+1;
   for(int left=0;left<width;left+=512){
    const int core=std::min(512,width-left),x0=std::max(0,left-radius),length=std::min(width,left+core+radius)-x0,stride=(length+1)*7;
    std::vector<double> prefix(size_t(rows)*stride);
    auto load=[&](int y){
     double* row=prefix.data()+size_t((y+radius)%rows)*stride;std::fill_n(row,stride,0.);
     if(y<0||y>=height)return;
     for(int x=0;x<length;x++){
      const int at=y*width+x0+x,t=targets.get(at);const float squared=distances.get(at);
      if(t< -1||t>=n||!(squared>=0))throw std::runtime_error("Invalid dense target or distance");
      double v[7]={};if(t>=0&&squared<=threshold){double a=t%width-(x0+x),b=t/width-y;v[0]=1;v[1]=a;v[2]=b;v[3]=a*a;v[4]=b*b;v[5]=a*x;v[6]=b*x;}
      for(int k=0;k<7;k++)row[(x+1)*7+k]=row[x*7+k]+v[k];
     }
    };
    for(int y=-radius;y<=radius;y++)load(y);
    for(int y=0;y<height;y++){
     check();
     for(int x=left;x<left+core;x++){
      double sx=0,sy=0,sxx=0,syy=0,lxx=0,lxy=0,lyx=0,lyy=0;int valid=0;
      for(int dy=-radius;dy<=radius;dy++){
       int chord=int(std::sqrt(double(radius*radius-dy*dy))),lo=std::max(0,x-x0-chord),hi=std::min(length,x-x0+chord+1);
       const double* row=prefix.data()+size_t((y+dy+radius)%rows)*stride;double v[7];for(int k=0;k<7;k++)v[k]=row[hi*7+k]-row[lo*7+k];
       valid+=int(v[0]);sx+=v[1];sy+=v[2];sxx+=v[3];syy+=v[4];lxx+=v[5]-(x-x0)*v[1];lyx+=v[6]-(x-x0)*v[2];lxy+=dy*v[1];lyy+=dy*v[2];
      }
      double residual=0;residual+=sxx-sx*sx/count;residual-=lxx*lxx/moment;residual-=lxy*lxy/moment;residual+=syy-sy*sy/count;residual-=lyx*lyx/moment;residual-=lyy*lyy/moment;
      double e=std::sqrt((residual>0?residual:0)/count);int i=y*width+x;errors.set(i,float(e));selected.set(i,valid==count&&e<=error_threshold?1:0);
     }
     if(y+1<height)load(y+radius+1);
    }
   }
  }else{
   for(int y=0;y<height;y++){check();for(int x=0;x<width;x++){
    double sx=0,sy=0,sxx=0,syy=0,lxx=0,lxy=0,lyx=0,lyy=0;int valid=0;
    for(int dy=-radius;dy<=radius;dy++){int yy=y+dy;if(yy<0||yy>=height)continue;for(int dx=-radius;dx<=radius;dx++){int xx=x+dx;if(dx*dx+dy*dy>radius*radius||xx<0||xx>=width)continue;
     int i=yy*width+xx,t=targets.get(i);float squared=distances.get(i);if(t< -1||t>=n||!(squared>=0))throw std::runtime_error("Invalid dense target or distance");if(t<0||squared>threshold)continue;
     valid++;double a=t%width-xx,b=t/width-yy;sx+=a;sy+=b;sxx+=a*a;syy+=b*b;lxx+=a*dx;lxy+=a*dy;lyx+=b*dx;lyy+=b*dy;
    }}
    double residual=0;residual+=sxx-sx*sx/count;residual-=lxx*lxx/moment;residual-=lxy*lxy/moment;residual+=syy-sy*sy/count;residual-=lyx*lyx/moment;residual-=lyy*lyy/moment;
    double e=std::sqrt((residual>0?residual:0)/count);int i=y*width+x;errors.set(i,float(e));selected.set(i,valid==count&&e<=error_threshold?1:0);
   }}
  }
  if(minimum>1){
   Array<int> parents(4,n,page_bytes,slots),labels(6,n,page_bytes,slots);Array<uint32_t> sizes(5,n,page_bytes,slots);
   struct Run{int first,last,node;};std::vector<Run> previous;
   auto root=[&](int i){int p=parents.get(i);while(p!=i){int q=parents.get(p);parents.set(i,q);i=p;p=q;}return i;};
   auto join=[&](int a,int b){a=root(a);b=root(b);if(a==b)return a;uint32_t as=sizes.get(a),bs=sizes.get(b);if(as<bs){std::swap(a,b);std::swap(as,bs);}parents.set(b,a);sizes.set(a,std::min(uint32_t(minimum),as+bs));return a;};
   for(int y=0;y<height;y++){
    check();std::vector<Run> current;size_t p=0;
    for(int x=0;x<width;){if(!selected.get(y*width+x)){x++;continue;}int first=x;while(x<width&&selected.get(y*width+x))x++;int last=x-1,id=y*width+first;parents.set(id,id);sizes.set(id,std::min(uint32_t(minimum),uint32_t(last-first+1)));
     for(int col=first;col<=last;col++)labels.set(y*width+col,id);
     while(p<previous.size()&&previous[p].last<first)p++;
     for(size_t j=p;j<previous.size()&&previous[j].first<=last;j++)id=join(id,previous[j].node);
     current.push_back({first,last,id});
    }
    previous.swap(current);
   }
   for(int i=0;i<n;i++){if((i&4095)==0)check();if(selected.get(i)&&sizes.get(root(labels.get(i)))<uint32_t(minimum))selected.set(i,0);}
  }
  selected.flush();errors.flush();return 0;
 }catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -1;}
}

#include "../vendor/dense-paged-source/polygon.h"
extern "C" int dense_paged_regions(int width,int height,int dw,int dh,double shift,const double* points,const int* polygons,int polygons_count,int regions,int page_bytes,int slots,char* error){
 try{
  if(width<=0||height<=0||dw<=0||dh<=0||int64_t(dw)*dh>INT32_MAX||regions<0||regions>2||polygons_count<regions)throw std::runtime_error("Invalid stored polygon geometry");
  Array<unsigned char> mask(0,uint64_t(dw)*dh,page_bytes,slots);
  for(int i=0;i<dw*dh;i++){if((i&65535)==0)check();mask.set(i,regions?0:1);}
  for(int p=0;p<polygons_count;p++){
   auto write=[&](int y,int left,int right){
    int ya=std::max(0,int(std::ceil(y-shift-.5))),yb=std::min(dh-1,int(std::floor(y-shift+.5)));
    int xa=std::max(0,int(std::ceil(left-shift-.5))),xb=std::min(dw-1,int(std::floor(right-shift+.5)));
    while(xa<=xb&&std::nearbyint(xa+shift)<left)xa++;while(xa<=xb&&std::nearbyint(xb+shift)>right)xb--;
    for(int yy=ya;yy<=yb;yy++)if(std::nearbyint(yy+shift)==y)for(int xx=xa;xx<=xb;xx++){int i=yy*dw+xx;mask.set(i,p<regions?mask.get(i)|(1<<p):0);}
   };
   dense_polygon(width,height,points+size_t(polygons[p*2])*2,polygons[p*2+1],write);
  }
  mask.flush();return 0;
 }catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -1;}
}

extern "C" int dense_paged_links(int count,int limit,float threshold,int page_bytes,int slots,uint32_t* stats,char* error){
 try{
  if(count<1||limit<1||page_bytes<512||page_bytes%8||slots<1)throw std::runtime_error("Invalid paged link selection");
  Array<int> targets(0,count,page_bytes,slots),rows(3,std::min(count,limit),page_bytes,slots);
  Array<float> squared(1,count,page_bytes,slots);Array<unsigned char> selected(2,count,page_bytes,slots);
  auto accepted=[&](int i){if(!selected.get(i))return false;int other=targets.get(i);if(other<0||other>=count)return false;return !(selected.get(other)&&targets.get(other)==i&&(squared.get(other)<squared.get(i)||(squared.get(other)==squared.get(i)&&other<i)));};
  uint32_t total=0,dense_count=0;
  for(int i=0;i<count;i++){if((i&4095)==0)check();if(targets.get(i)>=0&&squared.get(i)<=threshold)dense_count++;if(accepted(i))total++;}
  uint32_t size=std::min(uint32_t(limit),total),rank=0,written=0,wanted=0;double step=size>1?double(total-1)/(size-1):0;
  for(int i=0;i<count&&written<size;i++){if((i&4095)==0)check();if(!accepted(i))continue;if(rank==wanted){rows.set(written++,i);wanted=written==size-1?total-1:uint32_t(std::floor(written*step));}rank++;}
  rows.flush();stats[0]=total;stats[1]=written;stats[2]=dense_count;return 0;
 }catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -1;}
}

extern "C" int dense_paged_guide_labels(const float* points,int count,int width,int height,const double* vertices,const int* polygons,int guides,int* labels,char* error){
 try{
  if(count<0||width<1||height<1||guides<0)throw std::runtime_error("Invalid sparse guide labels");
  struct Point{int y,x,id;};std::vector<Point> sorted;sorted.reserve(count);std::vector<int> visited(count,-1);std::fill_n(labels,count,-1);
  for(int i=0;i<count;i++)sorted.push_back({std::max(0,std::min(height-1,int(std::nearbyint(points[size_t(i)*7+1])))),std::max(0,std::min(width-1,int(std::nearbyint(points[size_t(i)*7])))),i});
  auto less=[](const Point& a,const Point& b){return a.y!=b.y?a.y<b.y:a.x<b.x;};std::sort(sorted.begin(),sorted.end(),less);
  for(int g=0;g<guides;g++){
   auto write=[&](int y,int left,int right){auto at=std::lower_bound(sorted.begin(),sorted.end(),Point{y,left,0},less);for(;at!=sorted.end()&&at->y==y&&at->x<=right;at++)if(visited[at->id]!=g){visited[at->id]=g;labels[at->id]=labels[at->id]==-1?g:-2;}};
   dense_polygon(width,height,vertices+size_t(polygons[g*2])*2,polygons[g*2+1],write);
  }
  for(int i=0;i<count;i++)if(labels[i]<0)labels[i]=-1;return 0;
 }catch(const std::exception& e){std::strncpy(error,e.what(),1023);error[1023]=0;return -1;}
}

// NumPy 1.26.4 aquicksort_/aheapsort_ traversal (Charles R. Harris,
// BSD-3-Clause, vendor/numpy-sort). Keys move with IDs so every partition is a
// sequential external scan rather than random gathers into the original keys.
extern "C" int numpy_paged_sort(int count,int page_bytes,int slots,char* error){
 try{
  if(count<0||page_bytes<512||page_bytes%8||slots<1)throw std::runtime_error("Invalid external sort");
  if(!count)return 0;
  Array<double> keys(0,count,page_bytes,slots);Array<uint32_t> ids(1,count,page_bytes,slots);uint32_t ticks=0;
  auto tick=[&](){if((ticks++&4095)==0)check();};
  auto less=[](double x,double y){return x<y||(!std::isnan(x)&&std::isnan(y));};
  auto swap=[&](int i,int j){double x=keys.get(i),y=keys.get(j);uint32_t a=ids.get(i),b=ids.get(j);keys.set(i,y);keys.set(j,x);ids.set(i,b);ids.set(j,a);};
  auto heap=[&](int lo,int n){
   const int base=lo-1;
   auto sift=[&](int i,int size,double value,uint32_t id){
    for(int64_t j=int64_t(i)*2;j<=size;j*=2){tick();if(j<size&&less(keys.get(base+j),keys.get(base+j+1)))j++;double child=keys.get(base+j);if(!less(value,child))break;keys.set(base+i,child);ids.set(base+i,ids.get(base+j));i=int(j);}
    keys.set(base+i,value);ids.set(base+i,id);
   };
   for(int l=n>>1;l>0;l--)sift(l,n,keys.get(base+l),ids.get(base+l));
   while(n>1){tick();double value=keys.get(base+n);uint32_t id=ids.get(base+n);keys.set(base+n,keys.get(base+1));ids.set(base+n,ids.get(base+1));sift(1,--n,value,id);}
  };
  struct Part{int lo,hi,depth;};std::vector<Part> stack;int lo=0,hi=count-1,depth=2*(31-__builtin_clz(uint32_t(count)));
  for(;;){
   tick();if(depth<0)heap(lo,hi-lo+1);
   else{
    while(hi-lo>15){
     int mid=lo+((hi-lo)>>1);if(less(keys.get(mid),keys.get(lo)))swap(mid,lo);if(less(keys.get(hi),keys.get(mid)))swap(hi,mid);if(less(keys.get(mid),keys.get(lo)))swap(mid,lo);
     double pivot=keys.get(mid);int i=lo,j=hi-1;swap(mid,j);
     for(;;){do{++i;tick();}while(less(keys.get(i),pivot));do{--j;tick();}while(less(pivot,keys.get(j)));if(i>=j)break;swap(i,j);}
     swap(i,hi-1);--depth;if(i-lo<hi-i){stack.push_back({i+1,hi,depth});hi=i-1;}else{stack.push_back({lo,i-1,depth});lo=i+1;}
    }
    for(int i=lo+1;i<=hi;i++){double value=keys.get(i);uint32_t id=ids.get(i);int j=i;while(j>lo&&less(value,keys.get(j-1))){tick();keys.set(j,keys.get(j-1));ids.set(j,ids.get(j-1));j--;}keys.set(j,value);ids.set(j,id);}
   }
   if(stack.empty())break;auto p=stack.back();stack.pop_back();lo=p.lo;hi=p.hi;depth=p.depth;
  }
  keys.flush();ids.flush();return 0;
 }catch(const std::exception& e){if(error){std::strncpy(error,e.what(),1023);error[1023]=0;}return 1;}
}

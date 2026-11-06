#pragma once
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <limits>

// No allocation: all pointers belong to the caller's single accounted arena.
struct CompactGraphStorage {
 static constexpr uint32_t END=0xffffffffU;
 uint32_t width=0,height=0,n=0,C=0,M=0,R=0,blocks=0,phase=0,at=0;
 bool constant=false,identity=false,compressed=false,ready=false;
 uint8_t*arena=nullptr;uint64_t arenaBytes=0,endOffset=0,graphBytes=0;
 int32_t*denseRoots=nullptr,*temporaryRoots=nullptr;uint16_t*levels=nullptr;
 uint32_t*nextDense=nullptr,*nonrootPrefix=nullptr,*specialPrefix=nullptr,*parents=nullptr,*nextSparse=nullptr,*counts=nullptr,*heads=nullptr;
 uint64_t*nonroots=nullptr,*special=nullptr;
 template<class T>bool place(T*&out,uint64_t count,uint64_t&cursor){cursor=(cursor+alignof(T)-1)&~uint64_t(alignof(T)-1);if(cursor>arenaBytes||count>(arenaBytes-cursor)/sizeof(T))return false;out=reinterpret_cast<T*>(arena+cursor);cursor+=count*sizeof(T);return true;}
 static uint32_t pop(uint64_t bits){return uint32_t(__builtin_popcountll(bits));}
 static uint64_t below(uint32_t bit){return bit?(uint64_t(1)<<bit)-1:0;}
 uint32_t rank(const uint64_t*bits,const uint32_t*prefix,uint32_t pixel)const{return prefix[pixel>>6]+pop(bits[pixel>>6]&below(pixel&63));}
 bool marked(const uint64_t*bits,uint32_t pixel)const{return (bits[pixel>>6]>>(pixel&63))&1;}
 bool init(int32_t*roots,uint16_t*source,uint32_t w,uint32_t h,uint32_t components,uint32_t nontrivial,uint8_t*memory,uint64_t capacity,uint64_t graphStart){
  width=w;height=h;n=w*h;C=components;M=n-C;R=nontrivial;blocks=(n+63)/64;arena=memory;arenaBytes=capacity;levels=source;temporaryRoots=roots;constant=C==1;identity=C==n;
  uint64_t cursor=graphStart;endOffset=cursor;phase=at=0;
  if(constant||identity){compressed=true;ready=true;phase=9;graphBytes=0;return true;}
  const uint64_t mapBytes=uint64_t(blocks)*8+uint64_t(blocks+1)*4;
  const uint64_t sparseBytes=2*mapBytes+8ULL*M+8ULL*R,denseBytes=8ULL*n+mapBytes;
  compressed=sparseBytes<denseBytes;
  if(!compressed){denseRoots=roots;if(!place(nextDense,n,cursor))return false;}
  if(!place(nonroots,blocks,cursor)||!place(nonrootPrefix,blocks+1,cursor))return false;
  if(compressed){if(!place(special,blocks,cursor)||!place(specialPrefix,blocks+1,cursor)||!place(parents,M,cursor)||!place(nextSparse,M,cursor)||!place(counts,R,cursor)||!place(heads,R,cursor))return false;}
  endOffset=cursor;graphBytes=compressed?cursor-graphStart:4ULL*n+cursor-graphStart;return true;
 }
 bool boundary(uint32_t p)const{uint32_t x=p%width,y=p/width;for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){if((!dx&&!dy)||(dx<0&&!x)||(dx>0&&x+1>=width)||(dy<0&&!y)||(dy>0&&y+1>=height))continue;uint32_t q=uint32_t(int64_t(p)+int64_t(dy)*width+dx);if(levels[q]!=levels[p])return true;}return false;}
 int step(uint32_t&work){
  while(work&&!ready){
   if(phase==0){while(at<blocks&&work){nonroots[at]=0;if(compressed)special[at]=0;at++;work--;}if(at==blocks){phase=1;at=0;}}
   else if(phase==1){while(at<n&&work){int32_t p=temporaryRoots[at];if(p>=0)nonroots[at>>6]|=uint64_t(1)<<(at&63);else if(compressed&&p<-1)special[at>>6]|=uint64_t(1)<<(at&63);at++;work--;}if(at==n){phase=2;at=0;nonrootPrefix[0]=0;if(compressed)specialPrefix[0]=0;}}
   else if(phase==2){while(at<blocks&&work){nonrootPrefix[at+1]=nonrootPrefix[at]+pop(nonroots[at]);if(compressed)specialPrefix[at+1]=specialPrefix[at]+pop(special[at]);at++;work--;}
    if(at==blocks){if(nonrootPrefix[blocks]!=M||(compressed&&specialPrefix[blocks]!=R))return -2;phase=3;at=0;}}
   else if(phase==3){while(at<n&&work){int32_t p=temporaryRoots[at];if(compressed){if(p>=0){uint32_t k=rank(nonroots,nonrootPrefix,at);parents[k]=uint32_t(p);nextSparse[k]=END;}else if(p<-1){uint32_t k=rank(special,specialPrefix,at);counts[k]=uint32_t(-p);heads[k]=END;}}else nextDense[at]=END;at++;work--;}
    if(at==n){phase=4;at=n;}}
   else if(phase==4){while(at&&work){uint32_t i=--at;int32_t p=temporaryRoots[i];if(p>=0&&boundary(i)){uint32_t r=uint32_t(p);if(compressed){uint32_t k=rank(nonroots,nonrootPrefix,i),h=rank(special,specialPrefix,r);nextSparse[k]=heads[h];heads[h]=i;}else{nextDense[i]=nextDense[r];nextDense[r]=i;}}work--;}
    if(!at){temporaryRoots=nullptr;ready=true;phase=9;}}
  }return ready?1:0;
 }
 bool isRoot(uint32_t pixel)const{return constant?pixel==0:identity?true:!marked(nonroots,pixel);}
 uint32_t owner(uint32_t pixel)const{if(constant)return 0;if(identity)return pixel;if(!compressed)return denseRoots[pixel]<0?pixel:uint32_t(denseRoots[pixel]);return marked(nonroots,pixel)?parents[rank(nonroots,nonrootPrefix,pixel)]:pixel;}
 uint32_t count(uint32_t root)const{if(constant)return n;if(identity)return 1;if(!compressed)return uint32_t(-denseRoots[root]);return marked(special,root)?counts[rank(special,specialPrefix,root)]:1;}
 uint32_t cid(uint32_t root)const{return constant?0:identity?root:root-rank(nonroots,nonrootPrefix,root);}
 uint32_t nextMember(uint32_t pixel)const{if(constant||identity)return END;if(!compressed)return nextDense[pixel];return marked(nonroots,pixel)?nextSparse[rank(nonroots,nonrootPrefix,pixel)]:marked(special,pixel)?heads[rank(special,specialPrefix,pixel)]:END;}
};

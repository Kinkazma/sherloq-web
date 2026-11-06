// Exact unique-edge materialization from an in-memory root/member graph.
// No 4N pair array, no disk, Float64 arithmetic without reassociation.
#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>

namespace {
constexpr uint32_t END=0xffffffffU;
constexpr uint64_t MIB=1024ULL*1024ULL,MAX_HEAP=0x80000000ULL;
constexpr double Q=0.7071067811865476;
struct NativeCompact {
 uint32_t width=0,height=0,n=0,phase=0,at=0,offset=0,scanX=0,C=0,E=0,ci=0;
 uint32_t heapCap=0,requestedCapacity=0,capacity=0,H=0;
 uint16_t minimum=65535,maximum=0;
 bool constant=false;
 int failure=0;
 uint64_t requiredBytes=0,replays=0;
 uint16_t *pixelLevels=nullptr,*nativeLevels=nullptr;
 uint8_t *boundary=nullptr;
 uint32_t boundaryBytes=0,boundaryAt=0;
 int32_t *roots=nullptr;
 uint32_t *next=nullptr,*rootIds=nullptr,*low=nullptr,*high=nullptr;
 double *levels=nullptr,*counts=nullptr,*area=nullptr,*difference=nullptr,*multiplicity=nullptr;
 uint32_t *keys=nullptr,*axial=nullptr,*diagonal=nullptr,*slots=nullptr;
 uint32_t used=0,rowIndex=0,rangeLo=0,rangeHi=0,member=END,memberX=0,memberY=0,neighborAt=0;
 uint32_t stackLo[64]{},stackHi[64]{},stackSize=0,emitAt=0,remainingDiagonal=0,edgeOut=0;
 double emitSum=0;
 bool overflow=false,emitActive=false;
 int rowMode=0; // 0 scans, 1 finishes/counts, 2 emits a sorted range.
 uint32_t *order=nullptr,*temporary=nullptr,radixPass=0,radixAt=0,buckets[256]{};
 bool scattering=false;
 double total=0,mass=0,median=0,weakScale=0,info[12]{};
 ~NativeCompact(){
  std::free(pixelLevels);std::free(roots);std::free(next);std::free(rootIds);std::free(boundary);
  std::free(levels);std::free(nativeLevels);std::free(counts);std::free(area);
  std::free(low);std::free(high);std::free(difference);std::free(multiplicity);
  freeHash();std::free(order);std::free(temporary);
 }
 template<class T>static bool allocate(T*&p,uint64_t count){
  if(!count){p=nullptr;return true;}
  if(count>uint64_t(SIZE_MAX)/sizeof(T))return false;
  p=static_cast<T*>(std::malloc(size_t(count)*sizeof(T)));return p!=nullptr;
 }
 bool admit(uint64_t bytes){requiredBytes=std::max(requiredBytes,bytes);return requiredBytes<=heapCap&&requiredBytes<=MAX_HEAP;}
 uint32_t find(uint32_t i){uint32_t r=i;while(roots[r]>=0)r=uint32_t(roots[r]);while(i!=r){uint32_t p=uint32_t(roots[i]);roots[i]=int32_t(r);i=p;}return r;}
 bool forwardNeighbor(uint32_t&b){
  int dx=offset==1?0:offset==3?-1:1;
  if((dx<0&&scanX==0)||(dx>0&&scanX+1>=width)||(offset&&at+width>=n))return false;
  b=at+(offset?width:0);if(dx<0)--b;else if(dx>0)++b;return true;
 }
 void freeHash(){std::free(keys);std::free(axial);std::free(diagonal);std::free(slots);keys=axial=diagonal=slots=nullptr;used=0;}
 void clearHash(){for(uint32_t j=0;j<used;j++){uint32_t slot=slots[j];keys[slot]=END;axial[slot]=diagonal[slot]=0;}used=0;}
 void setMember(uint32_t i){member=i;if(i!=END){memberX=i%width;memberY=i/width;}neighborAt=0;}
 void beginRange(uint32_t lo,uint32_t hi){clearHash();rangeLo=lo;rangeHi=hi;overflow=false;rowMode=0;emitAt=0;emitActive=false;setMember(rootIds[rowIndex]);}
 void beginRows(){rowIndex=0;edgeOut=0;stackSize=0;beginRange(0,C);}
 bool incidentNeighbor(uint32_t direction,uint32_t&b)const{
  switch(direction){
   case 0:if(memberX+1>=width)return false;b=member+1;return true;
   case 1:if(!memberX)return false;b=member-1;return true;
   case 2:if(memberY+1>=height)return false;b=member+width;return true;
   case 3:if(!memberY)return false;b=member-width;return true;
   case 4:if(memberX+1>=width||memberY+1>=height)return false;b=member+width+1;return true;
   case 5:if(!memberX||!memberY)return false;b=member-width-1;return true;
   case 6:if(!memberX||memberY+1>=height)return false;b=member+width-1;return true;
   default:if(memberX+1>=width||!memberY)return false;b=member-width+1;return true;
  }
 }
 bool addNeighbor(uint32_t b,uint32_t direction){
  const uint32_t otherRoot=roots[b]<0?b:uint32_t(roots[b]);
  const uint32_t other=uint32_t(-roots[otherRoot]-1);
  if(other<rangeLo||other>=rangeHi||nativeLevels[other]<=nativeLevels[rowIndex])return true;
  uint32_t slot=(other*2654435761U)&(H-1);
  while(keys[slot]!=END&&keys[slot]!=other)slot=(slot+1)&(H-1);
  if(keys[slot]==END){if(used==capacity)return false;keys[slot]=other;slots[used++]=slot;}
  if(direction<4)axial[slot]++;else diagonal[slot]++;
  return true;
 }
 // False means every canonical low/high range has been completed.
 bool advanceRange(){
  clearHash();
  if(stackSize){--stackSize;beginRange(stackLo[stackSize],stackHi[stackSize]);return true;}
  if(++rowIndex<C){beginRange(0,C);return true;}
  return false;
 }
 // Returns 1 when all rows are complete, 0 for a bounded-work pause, <0 failure.
 int rows(uint32_t&work,bool write){
  while(work&&rowIndex<C){
   if(rowMode==0){
    while(member!=END&&work){
     const uint32_t direction=neighborAt++;uint32_t b;
     if(incidentNeighbor(direction,b)&&!addNeighbor(b,direction)){overflow=true;member=END;}
     --work;
     if(member!=END&&neighborAt==8)setMember(next?next[member]:END);
    }
    if(member!=END)break;
    rowMode=1;
   }
   if(rowMode==1){
    if(overflow){
     const uint32_t lo=rangeLo,hi=rangeHi,middle=lo+(hi-lo)/2;
     if(middle==lo||stackSize>=64)return -2;
     stackLo[stackSize]=middle;stackHi[stackSize++]=hi;replays++;
     beginRange(lo,middle);continue;
    }
    if(!write){
     if(uint64_t(E)+used>0x7fffffffULL)return -4;E+=used;
     if(work)--work;
     if(!advanceRange())return 1;
     continue;
    }
    std::sort(slots,slots+used,[this](uint32_t a,uint32_t b){return keys[a]<keys[b];});
    emitAt=0;emitActive=false;rowMode=2;
   }
   if(rowMode==2){
    while(emitAt<used&&work){
     const uint32_t slot=slots[emitAt];
     if(!emitActive){emitSum=double(axial[slot]);remainingDiagonal=diagonal[slot];emitActive=true;}
     while(remainingDiagonal&&work){emitSum+=Q;--remainingDiagonal;--work;}
     if(remainingDiagonal)break;
     if(edgeOut>=E)return -2;
     low[edgeOut]=rowIndex;high[edgeOut]=keys[slot];difference[edgeOut]=levels[keys[slot]]-levels[rowIndex];multiplicity[edgeOut]=emitSum;
     ++edgeOut;++emitAt;emitActive=false;if(work)--work;
    }
    if(emitAt<used)break;
    if(!advanceRange())return edgeOut==E?1:-2;
   }
  }
  return rowIndex==C?1:0;
 }
 uint32_t byteOf(uint32_t index,uint32_t pass)const{uint64_t bits;std::memcpy(&bits,&difference[index],8);return uint32_t((bits>>(8*pass))&255);}
 int step(uint32_t work){
  if(failure)return failure;
  while(work&&phase<20){
   if(phase==0){
    while(at<n&&work){roots[at]=-1;minimum=std::min(minimum,pixelLevels[at]);maximum=std::max(maximum,pixelLevels[at]);at++;work--;}
    if(at==n){
     constant=minimum==maximum;at=constant?1:0;
     if(constant)roots[0]=-int32_t(n);
     else{
      boundaryBytes=uint32_t((uint64_t(n)+7)/8);
      if(!admit(6ULL*n+boundaryBytes+8*MIB))return failure=-5;
      if(!allocate(boundary,boundaryBytes))return failure=-1;
     }
     offset=scanX=0;phase=1;
    }
   }else if(phase==1){
    if(constant){while(at<n&&work){roots[at++]=0;work--;}if(at==n){at=0;phase=2;}}
    else{
     // The bitmap is zeroed under the same bounded-work checkpoints as union.
     while(boundaryAt<boundaryBytes&&work){boundary[boundaryAt++]=0;work--;}
     if(boundaryAt<boundaryBytes)break;
     while(offset<4&&work){
      while(at<n&&work){
       uint32_t b;
       if(forwardNeighbor(b)){
        if(pixelLevels[at]==pixelLevels[b]){uint32_t a=find(at),r=find(b);if(a!=r){if(a>r)std::swap(a,r);roots[a]+=roots[r];roots[r]=int32_t(a);}}
        else{boundary[at>>3]|=uint8_t(1U<<(at&7));boundary[b>>3]|=uint8_t(1U<<(b&7));}
       }
       at++;if(++scanX==width)scanX=0;work--;
      }
      if(at==n){at=scanX=0;offset++;}
     }
     if(offset==4){phase=2;at=0;}
    }
   }else if(phase==2){
    while(at<n&&work){if(roots[at]<0)C++;else roots[at]=int32_t(find(at));at++;work--;}
    if(at==n){phase=3;at=0;return 0;} // inspect C before C/next allocation
   }else if(phase==3){
    const uint64_t lowerTarget=96ULL*(C-1)+256ULL*C+8*MIB;
    if(lowerTarget>MAX_HEAP){requiredBytes=lowerTarget;return failure=-4;}
    capacity=1;while(capacity<C&&capacity<requestedCapacity)capacity*=2;H=capacity*2;
    const uint64_t nextBytes=C>1&&C<n?4ULL*n:0;
    // Boundary bits and row hash never coexist: release the former after
    // building next. Constant/singleton rows do not need next at all.
    if(!nextBytes){std::free(boundary);boundary=nullptr;}
    const uint64_t boundaryLive=boundary?boundaryBytes:0;
    if(!admit(6ULL*n+nextBytes+30ULL*C+std::max<uint64_t>(boundaryLive,28ULL*capacity)+8*MIB))return failure=-5;
    if(!allocate(rootIds,C)||!allocate(levels,C)||!allocate(nativeLevels,C)||!allocate(counts,C)||!allocate(area,C))return failure=-1;
    if(nextBytes){if(!allocate(next,n))return failure=-1;phase=4;}else phase=6;
    at=0;
   }else if(phase==4){
    while(at<n&&work){next[at++]=END;work--;}if(at==n){phase=5;at=n;}
   }else if(phase==5){
    // Counts still include every pixel. Only pixels touching a different
    // level can contribute an edge, so interior members need no row traversal.
    // The root itself remains the implicit first member even when interior.
    while(at&&work){const uint32_t i=--at,r=roots[i]<0?i:uint32_t(roots[i]);if(i!=r&&(boundary[i>>3]&(1U<<(i&7)))){next[i]=next[r];next[r]=i;}work--;}
    if(!at){std::free(boundary);boundary=nullptr;phase=6;ci=0;}
   }else if(phase==6){
    while(at<n&&work){if(roots[at]<0){if(ci>=C)return failure=-2;rootIds[ci]=at;nativeLevels[ci]=pixelLevels[at];levels[ci]=double(pixelLevels[at])/65535.;counts[ci]=double(-roots[at]);area[ci]=counts[ci]/double(n);ci++;}at++;work--;}
    if(at==n){if(ci!=C)return failure=-2;phase=7;at=0;}
   }else if(phase==7){
    while(at<C&&work){roots[rootIds[at]]=-int32_t(at+1);at++;work--;}
    if(at==C){phase=8;at=0;}
   }else if(phase==8){
    if(!keys){if(!allocate(keys,H)||!allocate(axial,H)||!allocate(diagonal,H)||!allocate(slots,capacity))return failure=-1;}
    while(at<H&&work){keys[at]=END;axial[at]=diagonal[at]=0;at++;work--;}
    if(at==H){phase=9;E=0;beginRows();}
   }else if(phase==9){
    const int status=rows(work,false);if(status<0)return failure=status;
    if(status==1){phase=10;at=0;return 0;} // inspect E before edge allocation
   }else if(phase==10){
    const uint64_t targetBytes=96ULL*E+256ULL*C+8*MIB;
    if(targetBytes>MAX_HEAP){requiredBytes=targetBytes;return failure=-4;}
    if(!admit(10ULL*n+30ULL*C+32ULL*E+28ULL*capacity+8*MIB))return failure=-5;
    if(!allocate(low,E)||!allocate(high,E)||!allocate(difference,E)||!allocate(multiplicity,E))return failure=-1;
    phase=11;beginRows();
   }else if(phase==11){
    const int status=rows(work,true);if(status<0)return failure=status;
    if(status==1){phase=12;at=0;std::free(pixelLevels);pixelLevels=nullptr;std::free(next);next=nullptr;std::free(rootIds);rootIds=nullptr;freeHash();}
   }else if(phase==12){
    if(E&&!order){if(!allocate(order,E)||!allocate(temporary,E))return failure=-1;}
    while(at<E&&work){order[at]=at;at++;work--;}
    if(at==E){phase=13;radixPass=radixAt=0;scattering=false;std::fill(buckets,buckets+256,0);}
   }else if(phase==13){
    if(radixPass==8){phase=14;at=0;continue;}
    if(!scattering){
     while(radixAt<E&&work){buckets[byteOf(order[radixAt],radixPass)]++;radixAt++;work--;}
     if(radixAt==E){uint32_t nonempty=0;for(uint32_t count:buckets)if(count)nonempty++;if(nonempty<=1){radixPass++;radixAt=0;std::fill(buckets,buckets+256,0);}else{uint32_t sum=0;for(auto&count:buckets){uint32_t previous=count;count=sum;sum+=previous;}scattering=true;radixAt=0;}}
    }else{
     while(radixAt<E&&work){uint32_t index=order[radixAt++];temporary[buckets[byteOf(index,radixPass)]++]=index;work--;}
     if(radixAt==E){std::swap(order,temporary);radixPass++;radixAt=0;scattering=false;std::fill(buckets,buckets+256,0);}
    }
   }else if(phase==14){
    while(at<E&&work){total+=multiplicity[order[at++]];work--;}
    if(at==E){phase=15;at=0;}
   }else if(phase==15){
    while(at<E&&work){uint32_t e=order[at++];mass+=multiplicity[e];if(!weakScale&&mass>=.01*total)weakScale=difference[e];if(mass>=.5*total){median=difference[e];at=E;}work--;}
    if(at==E){std::free(order);std::free(temporary);order=temporary=nullptr;phase=16;at=0;}
   }else if(phase==16){
    while(at<n&&work){if(roots[at]>=0)roots[at]=roots[uint32_t(roots[at])];at++;work--;}
    if(at==n){phase=17;at=0;}
   }else if(phase==17){
    while(at<n&&work){roots[at]=-roots[at]-1;at++;work--;}
    if(at==n)phase=20;
   }
  }
  return phase==20?1:0;
 }
};
}
extern "C" {
uintptr_t nc_create(uint32_t width,uint32_t height,uint32_t heapCap,uint32_t rowCapacity){
 const uint64_t n=uint64_t(width)*height;
 if(!width||!height||n>=0x80000000ULL||heapCap<16*MIB||heapCap>MAX_HEAP||6*n+8*MIB>heapCap||!rowCapacity||(rowCapacity&(rowCapacity-1))||rowCapacity>(1U<<25))return 0;
 auto*p=new(std::nothrow)NativeCompact;if(!p)return 0;
 p->width=width;p->height=height;p->n=uint32_t(n);p->heapCap=heapCap;p->requestedCapacity=rowCapacity;p->requiredBytes=6*n+8*MIB;
 if(!p->allocate(p->pixelLevels,n)||!p->allocate(p->roots,n)){delete p;return 0;}
 return reinterpret_cast<uintptr_t>(p);
}
void nc_destroy(NativeCompact*p){delete p;}
int nc_step(NativeCompact*p,uint32_t work){return p->step(std::max(1U,work));}
const double*nc_info(NativeCompact*p){
 p->info[0]=p->phase;p->info[1]=p->C;p->info[2]=p->E;p->info[3]=p->minimum;p->info[4]=p->maximum;p->info[5]=p->median;p->info[6]=p->weakScale;p->info[7]=double(p->requiredBytes);p->info[8]=double(p->replays);p->info[9]=p->capacity;p->info[10]=p->n;p->info[11]=p->failure;return p->info;
}
const void*nc_array(NativeCompact*p,int field){
 switch(field){case 0:return p->pixelLevels;case 1:return p->roots;case 2:return p->levels;case 3:return p->nativeLevels;case 4:return p->counts;case 5:return p->area;case 6:return p->low;case 7:return p->high;case 8:return p->difference;case 9:return p->multiplicity;default:return nullptr;}
}
}

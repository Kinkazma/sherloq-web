#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>

// Temporary exact weighted-quantile replay. No owned allocation: the caller
// supplies one arena, and this object contains only fixed 65536-entry tables.
// Count/append enumerate canonical (low representative, high representative)
// edges. Their axial/diagonal COUNTS must come directly from that enumeration.
namespace sherloq7c {
class ExactQuantileTape {
 static constexpr uint32_t K=65536;
 static constexpr double Q=.7071067811865476;
 enum Phase { Counting=0,Clearing=1,Appending=2,NextGap=3,Discover=4,
  Sort=5,Groups=6,ClearMasses=7,Scatter=8,Replay=9,Select=10,Done=11,Failed=12 };
 uint64_t gapBits[K]{},gapStart[K+1]{},gapWrite[K]{};
 uint32_t gapEdges[K]{};
 double gapEnd[K]{};
 // counts is first used for append validation, then reused by observed lows.
 uint32_t counts[K]{},generation[K]{},lowClass[K]{};
 uint64_t lowBits[K]{};
 double lowDifference[K]{};
 uint16_t lows[K]{},merge[K]{};
 double groupDifference[K]{};
 uint64_t groupStart[K+1]{},groupWrite[K]{};
 uint32_t groupEdges[K]{};
 uint8_t *tape=nullptr,*massTape=nullptr;
 uint64_t clearAt=0,appendedTerms=0,contacts=0,currentMassBits=0,currentMassBytes=0;
 uint32_t epoch=0,observed=0,processed=0,groups=0,groupBuild=0;
 uint16_t *sortRead=nullptr,*sortWrite=nullptr;
 uint32_t sortWidth=0,sortLeft=0,sortMid=0,sortRight=0,sortA=0,sortB=0,sortOut=0;
 bool sortingRun=false,selecting=false,pendingMass=false,replayReaderReady=false;
 uint32_t selected[2]{},selectionCount=0,selectionIndex=0,selectionScan=1;
 uint32_t weakGap=0,medianGap=0,replayGroup=0,replayEdge=0,remainingDiagonal=0;
 double accumulator=0,massValue=0,weakTarget=0,medianTarget=0;
 struct Reader {
  const uint8_t*data=nullptr;uint64_t bit=0,end=0,unary=0;
  uint32_t stage=0,low=0,axial=0,diagonal=0;
  void reset(const uint8_t*p,uint64_t begin,uint64_t limit){data=p;bit=begin;end=limit;unary=0;stage=0;low=axial=diagonal=0;}
 } reader;
 bool reject(int code){failure=code;phase=Failed;return false;}
 static bool plus(uint64_t a,uint64_t b,uint64_t&out){if(b>UINT64_MAX-a)return false;out=a+b;return true;}
 static uint64_t bytes(uint64_t bits){return bits/8+(bits%8!=0);}
 static void one(uint8_t*data,uint64_t bit){data[size_t(bit/8)]|=uint8_t(1U<<unsigned(bit%8));}
 static void unary(uint8_t*data,uint64_t&bit,uint32_t value){bit+=value;one(data,bit++);}
 static void low16(uint8_t*data,uint64_t&bit,uint32_t value){for(uint32_t j=0;j<16;j++,bit++)if(value&(1U<<j))one(data,bit);}
 bool valid(uint32_t gap,uint32_t low,uint32_t axial,uint32_t diagonal){return gap&&gap<K&&low<K-gap&&(axial||diagonal);}
 // One unary unit consumes one byte fragment or one zero/nonzero 32-bit word.
 // Very long masses therefore yield before completing their decoding.
 bool readUnary(uint32_t&work,uint32_t&answer){
  while(work){
   if(reader.bit>=reader.end)return reject(-5);
   const uint64_t available=reader.end-reader.bit;
   uint32_t word,take;
   if(!(reader.bit&7)&&available>=32){std::memcpy(&word,reader.data+size_t(reader.bit/8),4);take=32;
#if defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
    word=__builtin_bswap32(word);
#endif
   }else{take=uint32_t(std::min<uint64_t>(8-(reader.bit&7),available));word=(reader.data[size_t(reader.bit/8)]>>unsigned(reader.bit&7))&((1U<<take)-1);}
   work--;
   if(!word){reader.unary+=take;reader.bit+=take;if(reader.unary>UINT32_MAX)return reject(-3);continue;}
   const uint32_t zero=uint32_t(__builtin_ctz(word));reader.unary+=zero;reader.bit+=zero+1;
   if(reader.unary>UINT32_MAX)return reject(-3);answer=uint32_t(reader.unary);reader.unary=0;return true;
  }return false;
 }
 bool readRecord(uint32_t&work,bool withLow){
  if(reader.stage==0){
   if(withLow){if(!work)return false;if(reader.end-reader.bit<16)return reject(-5);reader.low=0;for(uint32_t j=0;j<16;j++,reader.bit++)reader.low|=((reader.data[size_t(reader.bit/8)]>>unsigned(reader.bit&7))&1U)<<j;work--;}
   reader.stage=1;
  }
  if(reader.stage==1){if(!readUnary(work,reader.axial))return false;reader.stage=2;}
  if(!readUnary(work,reader.diagonal))return false;
  if(!reader.axial&&!reader.diagonal)return reject(-5);reader.stage=0;return true;
 }
 void beginGap(){
  epoch++;observed=processed=groups=groupBuild=0;currentMassBits=gapBits[currentGap]-16ULL*gapEdges[currentGap];currentMassBytes=bytes(currentMassBits);
  reader.reset(tape,gapStart[currentGap],gapStart[currentGap+1]);phase=Discover;
 }
 void endGap(){
  if(selecting){selectionIndex++;phase=NextGap;}
  else{total=accumulator;gapEnd[currentGap]=total;currentGap++;phase=NextGap;}
 }
public:
 double weak=0,median=0,total=0;
 uint64_t tapeBytes=0,scratchBytes=0,usedBytes=0,terms=0,additions=0,selectionAdditions=0;
 int failure=0,phase=Counting;
 uint32_t currentGap=0;

 bool count(uint32_t gap,uint32_t low,uint32_t axial,uint32_t diagonal){
  if(phase!=Counting||failure)return reject(-1);
  if(!valid(gap,low,axial,diagonal))return reject(-2);
  if(terms==UINT32_MAX||gapEdges[gap]==UINT32_MAX)return reject(-3);
  const uint64_t contact=uint64_t(axial)+diagonal;
  if(!plus(gapBits[gap],18+contact,gapBits[gap])||!plus(contacts,contact,contacts))return reject(-3);
  gapEdges[gap]++;terms++;return true;
 }
 bool finalizeCounts(uint8_t*arena,uint64_t begin,uint64_t arenaBytes){
  if(phase!=Counting||failure||!terms)return reject(-1);
  uint64_t offset=0,maximumMassBits=0;
  for(uint32_t gap=0;gap<K;gap++){
   gapStart[gap]=gapWrite[gap]=offset;
   if(!plus(offset,gapBits[gap],offset))return reject(-3);
   maximumMassBits=std::max(maximumMassBits,gapBits[gap]-16ULL*gapEdges[gap]);
  }gapStart[K]=offset;tapeBytes=bytes(offset);scratchBytes=bytes(maximumMassBits);
  if(!plus(tapeBytes,scratchBytes,usedBytes)||!arena||begin>arenaBytes||usedBytes>arenaBytes-begin||arenaBytes>SIZE_MAX||uintptr_t(arena)>UINTPTR_MAX-size_t(arenaBytes))return reject(-4);
  tape=arena+size_t(begin);massTape=tape+size_t(tapeBytes);clearAt=0;phase=Clearing;return true;
 }
 int clearStep(uint32_t work){
  if(failure)return failure;if(phase==Appending)return 1;if(phase!=Clearing){reject(-1);return failure;}
  const size_t amount=size_t(std::min<uint64_t>(work,tapeBytes-clearAt));
  if(amount){std::memset(tape+size_t(clearAt),0,amount);clearAt+=amount;}
  if(clearAt==tapeBytes){phase=Appending;return 1;}return 0;
 }
 bool append(uint32_t gap,uint32_t low,uint32_t axial,uint32_t diagonal){
  if(phase!=Appending||failure)return reject(-1);
  if(!valid(gap,low,axial,diagonal))return reject(-2);
  const uint64_t bits=18+uint64_t(axial)+diagonal;
  if(counts[gap]>=gapEdges[gap]||gapWrite[gap]>gapStart[gap+1]||bits>gapStart[gap+1]-gapWrite[gap])return reject(-5);
  uint64_t&cursor=gapWrite[gap];low16(tape,cursor,low);unary(tape,cursor,axial);unary(tape,cursor,diagonal);counts[gap]++;appendedTerms++;return true;
 }
 bool finishAppend(){
  if(phase!=Appending||failure)return reject(-1);
  if(appendedTerms!=terms)return reject(-5);
  for(uint32_t gap=0;gap<K;gap++)if(counts[gap]!=gapEdges[gap]||gapWrite[gap]!=gapStart[gap+1])return reject(-5);
  currentGap=1;phase=NextGap;return true;
 }
 int step(uint32_t work){
  if(failure)return failure;if(phase<NextGap){reject(-1);return failure;}
  while(work&&phase!=Done&&phase!=Failed){
   if(phase==NextGap){
    if(selecting){if(selectionIndex==selectionCount){if(!(weak>0&&median>0&&std::isfinite(total))){reject(-6);break;}phase=Done;break;}currentGap=selected[selectionIndex];accumulator=gapEnd[currentGap-1];beginGap();}
    else if(currentGap==K){weakTarget=.01*total;medianTarget=.5*total;selectionScan=1;phase=Select;}
    else if(!gapEdges[currentGap]){gapEnd[currentGap]=total;currentGap++;work--;}
    else{accumulator=total;beginGap();}
   }else if(phase==Discover){
    if(processed==gapEdges[currentGap]){if(reader.bit!=reader.end){reject(-5);break;}sortRead=lows;sortWrite=merge;sortWidth=1;sortLeft=0;sortingRun=false;phase=Sort;continue;}
    if(!readRecord(work,true))continue;
    const uint32_t low=reader.low;if(low>=K-currentGap){reject(-5);break;}
    if(generation[low]!=epoch){generation[low]=epoch;counts[low]=0;lowBits[low]=0;lows[observed++]=uint16_t(low);lowDifference[low]=double(low+currentGap)/65535.-double(low)/65535.;}
    counts[low]++;lowBits[low]+=2+uint64_t(reader.axial)+reader.diagonal;processed++;
   }else if(phase==Sort){
    if(sortWidth>=observed){groupBuild=groups=0;currentMassBits=0;phase=Groups;continue;}
    if(sortLeft>=observed){std::swap(sortRead,sortWrite);sortWidth*=2;sortLeft=0;sortingRun=false;continue;}
    if(!sortingRun){sortMid=std::min(observed,sortLeft+sortWidth);sortRight=std::min(observed,sortLeft+2*sortWidth);sortA=sortOut=sortLeft;sortB=sortMid;sortingRun=true;}
    while(work&&sortOut<sortRight){sortWrite[sortOut++]=(sortA<sortMid&&(sortB>=sortRight||lowDifference[sortRead[sortA]]<=lowDifference[sortRead[sortB]]))?sortRead[sortA++]:sortRead[sortB++];work--;}
    if(sortOut==sortRight){sortLeft=sortRight;sortingRun=false;}
   }else if(phase==Groups){
    while(work&&groupBuild<observed){const uint32_t low=sortRead[groupBuild++];const double d=lowDifference[low];
     if(!groups||groupDifference[groups-1]!=d){groupDifference[groups]=d;groupStart[groups]=groupWrite[groups]=currentMassBits;groupEdges[groups]=0;groups++;}
     lowClass[low]=groups-1;groupEdges[groups-1]+=counts[low];currentMassBits+=lowBits[low];work--;
    }
    if(groupBuild==observed){groupStart[groups]=currentMassBits;if(currentMassBits!=gapBits[currentGap]-16ULL*gapEdges[currentGap]||bytes(currentMassBits)>scratchBytes){reject(-5);break;}currentMassBytes=bytes(currentMassBits);clearAt=0;phase=ClearMasses;}
   }else if(phase==ClearMasses){
    const uint32_t amount=uint32_t(std::min<uint64_t>(work,currentMassBytes-clearAt));if(amount){std::memset(massTape+size_t(clearAt),0,amount);clearAt+=amount;work-=amount;}
    if(clearAt==currentMassBytes){processed=0;reader.reset(tape,gapStart[currentGap],gapStart[currentGap+1]);phase=Scatter;}
   }else if(phase==Scatter){
    if(processed==gapEdges[currentGap]){if(reader.bit!=reader.end){reject(-5);break;}replayGroup=replayEdge=0;pendingMass=replayReaderReady=false;phase=Replay;continue;}
    if(!readRecord(work,true))continue;
    const uint32_t slot=lowClass[reader.low];if(slot>=groups){reject(-5);break;}uint64_t&cursor=groupWrite[slot];const uint64_t size=2+uint64_t(reader.axial)+reader.diagonal;
    if(cursor>groupStart[slot+1]||size>groupStart[slot+1]-cursor){reject(-5);break;}
    unary(massTape,cursor,reader.axial);unary(massTape,cursor,reader.diagonal);processed++;
   }else if(phase==Replay){
    if(replayGroup==groups){endGap();continue;}
    if(!replayReaderReady){if(groupWrite[replayGroup]!=groupStart[replayGroup+1]){reject(-5);break;}reader.reset(massTape,groupStart[replayGroup],groupStart[replayGroup+1]);replayReaderReady=true;}
    if(!pendingMass){if(!readRecord(work,false))continue;massValue=double(reader.axial);remainingDiagonal=reader.diagonal;pendingMass=true;}
    while(work&&remainingDiagonal){massValue+=Q;remainingDiagonal--;work--;}
    if(remainingDiagonal||!work)continue;
    accumulator+=massValue;work--;pendingMass=false;replayEdge++;if(selecting)selectionAdditions++;else additions++;
    if(selecting){if(currentGap==weakGap&&!weak&&accumulator>=weakTarget)weak=groupDifference[replayGroup];if(currentGap==medianGap&&!median&&accumulator>=medianTarget)median=groupDifference[replayGroup];
     if((currentGap!=weakGap||weak>0)&&(currentGap!=medianGap||median>0)){endGap();continue;}}
    if(replayEdge==groupEdges[replayGroup]){if(reader.bit!=reader.end){reject(-5);break;}replayGroup++;replayEdge=0;replayReaderReady=false;}
   }else if(phase==Select){
    while(work&&selectionScan<K){const uint32_t gap=selectionScan++;if(gapEdges[gap]){if(!weakGap&&gapEnd[gap]>=weakTarget)weakGap=gap;if(!medianGap&&gapEnd[gap]>=medianTarget)medianGap=gap;}work--;}
    if(selectionScan==K){if(!weakGap||!medianGap||additions!=terms||!(total>0&&std::isfinite(total))){reject(-6);break;}selected[0]=weakGap;selectionCount=1;if(medianGap!=weakGap)selected[selectionCount++]=medianGap;selectionIndex=0;selecting=true;phase=NextGap;}
   }else reject(-1);
  }
  return failure?failure:phase==Done?1:0;
 }
};
} // namespace sherloq7c

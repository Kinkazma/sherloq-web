// Bounded-memory global 7C target experiment. Float64 state, no global edges.
// The graph stays native. Only boundary members enter repeated row traversals.
// Compiled without fast-math or floating-point contraction.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>
#include <limits>
#include "target-memory-ringcert-graph.hpp"
#include "projection-pixel-forest-native.hpp"
#include "target-memory-exact-tape.hpp"
namespace {
constexpr uint32_t END=0xffffffffU; constexpr uint64_t MiB=1048576;
constexpr double Q=.7071067811865476,U=0x1p-53;
struct Edge {uint32_t lo,hi;double d,m,w,wanted,fidelity;};
struct Target {
 sherloq7c::ExactQuantileTape*exactTape=nullptr;bool exactTapeUsed=false;uint64_t exactTapeBytes=0,exactScratchBytes=0,exactTemporaryBytes=0,exactAdditions=0,exactTerms=0;double exactHistoricalTotal=0;
 struct PaletteCoefficient {double root,wanted,denominator,square;};PaletteCoefficient paletteCoefficients[256]{};uint8_t paletteRank[65536]{};uint16_t paletteLevels[16]{};bool paletteReady=false;
 struct QuantileRun{double difference=0,mass=0,end=0;uint64_t count=0;};QuantileRun quantileRuns[128]{};uint32_t quantileRunCount=0,replayRun=0;uint64_t replayPosition=0,replayedAdditions=0;double replayTotal=0;bool uniformRuns=true,replayedQuantiles=false;
 uint8_t*pairDirections=nullptr;uint32_t pairBuilds=0;uint64_t matchedPairVertices=0;bool pairCacheReady=false;
 CompactGraphStorage graph;bool graphReady=false;uint8_t*arena=nullptr;uint64_t arenaBytes=0,arenaCursor=0,arenaRootOffset=0,arenaUsed=0;uint32_t R=0;float*seedBand=nullptr;
 uint32_t width=0,height=0,n=0,C=0,phase=0,at=0,off=0,x=0,heapCap=0;
 uint8_t*special=nullptr,*visited=nullptr;uint32_t *parentKeys=nullptr,*nextKeys=nullptr,*nextValues=nullptr,parentCapacity=0,nextCapacity=0;int32_t*parentValues=nullptr;uint8_t present[65536]{};uint32_t uniqueLevels=0;double*initialRank=nullptr;bool seedProvided=false,seedAccepted=false,skipWarmup=false;
 uint16_t minimum=65535,maximum=0,*level=nullptr;int32_t*root=nullptr;uint32_t*next=nullptr;double*y=nullptr;
 uint32_t capacity=65536,H=131072,*keys=nullptr,*axial=nullptr,*diagonal=nullptr,*slots=nullptr,used=0;
 Edge*edges=nullptr;uint32_t edgeCapacity=65536,edgeCount=0;uint64_t E=0,visits=0,replays=0;
 double*hist=nullptr,*refine=nullptr;uint32_t*order=nullptr;double total=0,quantileError=0,median=0,weak=0,normalizer=0,micro=0,gain=0;
 uint32_t weakGap=0,medianGap=0;double prefixWeak=0,prefixMedian=0;bool exactQuantiles=false,constant=false,singleton=false;
 uint32_t state=0,scan=0,sweeps=0,maxSweeps=1000,innerSteps=8,blockSize=16,blockRoots[32]{},b=0;
 uint64_t localSteps=0,blockSolves=0,coarseAccepted=0;double maxError=.002,rmsTolerance=2e-4,maxBound=INFINITY,rmsBound=INFINITY,roundoff=0;
 double certGradientNorm=0,certNorm=0,certMax=0,certRound=0,certLinear=0,certNonlinear=0;
 double *certGradient=nullptr,*certAbsolute0=nullptr,*certAbsolute1=nullptr;uint32_t certAbsoluteFirst=0;bool certSingleEdgePass=false;uint64_t certEdgeEvaluations=0,certPasses=0;
 double*certRingGradient=nullptr,*certRingAbsolute=nullptr;uint32_t certRingLength=0,certRingInitialized=0,certRingReduced=0,certRingRootSlot=0,certRingInitSlot=0,certRingReduceSlot=0;bool certRingPass=false;
 double coarseH00=0,coarseWeighted=0,center=0,g0=0,g1=0,h01=0,h11=0,ca=0,cb=0,rate=1,coarseDirectional=0,change=0;uint32_t coarsePass=0,backtracks=0;
 double knotG[64]{},knotH[4096]{},knotStep[64]{};uint32_t knotIterations=0;bool warmupTooWide=false;uint16_t*curveCodes=nullptr;double curveTable[4096]{};bool cached=false,threeVectors=false;uint64_t curveClampCount=0,curveBuilds=0;bool sgs=false;bool useMixed=false;float *cgStep=nullptr,*cgResidual=nullptr,*cgDirection=nullptr,*cgProduct=nullptr;
 double *lookupW=nullptr,*lookupF=nullptr;double gradientNorm=0,rz=0,nextRz=0,denominator=0,residualNorm=0,cgThreshold=0,alpha=0,beta=0,trueNorm=0,directional=0;uint32_t cgAt=0,cgTotal=0,restarts=0,totalRestarts=0,trueChecks=0;bool gradientFallback=false,initialPrecond=false;
 uint32_t *packHeads=nullptr,packAt=0,packPhase=0,packCurrent=END;int32_t packLevel=0;double packError=0,packMargin=INFINITY;
 bool projectActive=false,projectStaging=false;uint32_t*projectTb=nullptr,*projectTrial=nullptr;uint32_t projectCopied=0,projectTrialCopied=0,projectCheckAt=0;double projectR=.5,projectMargin=INFINITY,projectInfo[32]{};sherloq7c::PixelForest forest;
 bool converged=false;int failure=0;double info[80]{};
 ~Target(){delete exactTape;std::free(packHeads);std::free(arena);std::free(seedBand);std::free(lookupW);std::free(lookupF);std::free(keys);std::free(axial);std::free(diagonal);std::free(slots);std::free(edges);std::free(hist);std::free(refine);std::free(order);std::free(initialRank);}
 template<class T>bool place(T*&out,uint64_t size){arenaCursor=(arenaCursor+alignof(T)-1)&~uint64_t(alignof(T)-1);if(arenaCursor>arenaBytes||size>(arenaBytes-arenaCursor)/sizeof(T))return false;out=reinterpret_cast<T*>(arena+arenaCursor);arenaCursor+=size*sizeof(T);arenaUsed=std::max(arenaUsed,arenaCursor);return true;}
 uint32_t cid(uint32_t r)const{return graph.cid(r);}
 double&Y(uint32_t r){return y[cid(r)];}double Y(uint32_t r)const{return y[cid(r)];}
 float&CV(float*v,uint32_t r){return v[cid(r)];}float CV(const float*v,uint32_t r)const{return v[cid(r)];}
 bool placeState(){arenaCursor=graph.endOffset;
  if(graph.compressed){cgStep=reinterpret_cast<float*>(arena+arenaRootOffset);}else if(!place(cgStep,C))return false;
  if(!place(y,C)||!place(cgResidual,C)||!place(cgDirection,C)||!place(curveCodes,3ULL*n)||!place(visited,(uint64_t(C)+7)/8)||!place(pairDirections,(uint64_t(n)+1)/2))return false;
  cgProduct=nullptr;return true;
 }

 template<class T>bool alloc(T*&p,uint64_t count){if(count>SIZE_MAX/sizeof(T))return false;p=static_cast<T*>(std::malloc(size_t(count)*sizeof(T)));return p!=nullptr;}
 uint32_t find(uint32_t i){uint32_t r=i;while(root[r]>=0)r=uint32_t(root[r]);while(i!=r){uint32_t p=uint32_t(root[i]);root[i]=int32_t(r);i=p;}return r;}
 uint32_t owner(uint32_t i)const{return graph.owner(i);}
 bool isRoot(uint32_t i)const{return graph.isRoot(i);}
 double count(uint32_t i)const{return double(graph.count(i));}
 uint32_t nextMember(uint32_t i)const{return graph.nextMember(i);}
 double value(uint32_t i)const{return double(level[i])/65535.;}
 bool neighbor(uint32_t p,uint32_t direction,uint32_t&other)const{uint32_t px=p%width,py=p/width;switch(direction){
 case 0:if(px+1>=width)return false;other=p+1;return true;
 case 1:if(!px)return false;other=p-1;return true;
 case 2:if(py+1>=height)return false;other=p+width;return true;
 case 3:if(!py)return false;other=p-width;return true;
 case 4:if(px+1>=width||py+1>=height)return false;other=p+width+1;return true;
 case 5:if(!px||!py)return false;other=p-width-1;return true;
 case 6:if(!px||py+1>=height)return false;other=p+width-1;return true;
 default:if(px+1>=width||!py)return false;other=p-width+1;return true;}}
 bool boundary(uint32_t p)const{for(uint32_t dir=0;dir<8;dir++){uint32_t q;if(neighbor(p,dir,q)&&level[p]!=level[q])return true;}return false;}
 void clearHash(){for(uint32_t j=0;j<used;j++){uint32_t s=slots[j];keys[s]=END;axial[s]=diagonal[s]=0;}used=0;}
 bool add(uint32_t other,bool diag){uint32_t s=(other*2654435761U)&(H-1);while(keys[s]!=END&&keys[s]!=other)s=(s+1)&(H-1);if(keys[s]==END){if(used==capacity)return false;keys[s]=other;slots[used++]=s;}if(diag)diagonal[s]++;else axial[s]++;return true;}
 double mass(uint32_t s)const{double m=axial[s];for(uint32_t k=diagonal[s];k;k--)m+=Q;return m;}
 // Canonical unique edges, ranges are visited in increasing representative order.
 template<class Callback>bool row(uint32_t r,bool outgoing,Callback cb){
  if(singleton){static constexpr uint32_t dirs[8]={5,3,7,1,0,6,2,4};for(uint32_t dir:dirs){uint32_t other;if(!neighbor(r,dir,other)||(outgoing&&level[other]<=level[r]))continue;const uint32_t lo=level[r]<level[other]?r:other,hi=lo==r?other:r;cb(lo,hi,value(hi)-value(lo),dir<4?1.:Q);}return true;}
  if(count(r)==1){uint32_t ids[8],ax[8]{},dg[8]{},k=0;for(uint32_t dir=0;dir<8;dir++){uint32_t pixel;if(!neighbor(r,dir,pixel))continue;uint32_t other=owner(pixel);if(outgoing&&level[other]<=level[r])continue;uint32_t j=0;while(j<k&&ids[j]!=other)j++;if(j==k)ids[k++]=other;if(dir<4)ax[j]++;else dg[j]++;}
   for(uint32_t i=1;i<k;i++){uint32_t id=ids[i],a=ax[i],d=dg[i],j=i;while(j&&ids[j-1]>id){ids[j]=ids[j-1];ax[j]=ax[j-1];dg[j]=dg[j-1];j--;}ids[j]=id;ax[j]=a;dg[j]=d;}
   for(uint32_t i=0;i<k;i++){uint32_t other=ids[i],lo=level[r]<level[other]?r:other,hi=lo==r?other:r;double m=ax[i];for(uint32_t j=dg[i];j;j--)m+=Q;cb(lo,hi,value(hi)-value(lo),m);}return true;
  }
  uint32_t stackLo[64],stackHi[64],sp=0,loRange=0,hiRange=n;
  while(true){clearHash();bool overflow=false;for(uint32_t member=r;member!=END&&!overflow;member=nextMember(member)){for(uint32_t dir=0;dir<8;dir++){uint32_t pix;if(!neighbor(member,dir,pix))continue;uint32_t other=owner(pix);visits++;if(other==r||other<loRange||other>=hiRange||(outgoing&&level[other]<=level[r]))continue;if(!add(other,dir>=4)){overflow=true;break;}}}
   if(overflow){uint32_t middle=loRange+(hiRange-loRange)/2;if(middle==loRange||sp>=64)return false;stackLo[sp]=middle;stackHi[sp++]=hiRange;hiRange=middle;replays++;continue;}
   std::sort(slots,slots+used,[this](uint32_t a,uint32_t c){return keys[a]<keys[c];});
   for(uint32_t j=0;j<used;j++){uint32_t s=slots[j],other=keys[s],lo=level[r]<level[other]?r:other,hi=lo==r?other:r;cb(lo,hi,value(hi)-value(lo),mass(s));}
   if(!sp)break;--sp;loRange=stackLo[sp];hiRange=stackHi[sp];
  }return true;
 }
 // Integer contact counts; never infer axial/diagonal counts from rounded mass.
 template<class Callback>bool rowCounts(uint32_t r,bool outgoing,Callback cb){
  if(singleton){static constexpr uint32_t dirs[8]={5,3,7,1,0,6,2,4};for(uint32_t dir:dirs){uint32_t other;if(!neighbor(r,dir,other)||(outgoing&&level[other]<=level[r]))continue;const uint32_t lo=level[r]<level[other]?r:other,hi=lo==r?other:r;if(!cb(lo,hi,dir<4?1:0,dir<4?0:1))return false;}return true;}
  if(count(r)==1){uint32_t ids[8],ax[8]{},dg[8]{},k=0;for(uint32_t dir=0;dir<8;dir++){uint32_t pixel;if(!neighbor(r,dir,pixel))continue;uint32_t other=owner(pixel);if(outgoing&&level[other]<=level[r])continue;uint32_t j=0;while(j<k&&ids[j]!=other)j++;if(j==k)ids[k++]=other;if(dir<4)ax[j]++;else dg[j]++;}
   for(uint32_t i=1;i<k;i++){uint32_t id=ids[i],a=ax[i],d=dg[i],j=i;while(j&&ids[j-1]>id){ids[j]=ids[j-1];ax[j]=ax[j-1];dg[j]=dg[j-1];j--;}ids[j]=id;ax[j]=a;dg[j]=d;}
   for(uint32_t i=0;i<k;i++){uint32_t other=ids[i],lo=level[r]<level[other]?r:other,hi=lo==r?other:r;if(!cb(lo,hi,ax[i],dg[i]))return false;}return true;
  }
  uint32_t stackLo[64],stackHi[64],sp=0,loRange=0,hiRange=n;
  while(true){clearHash();bool overflow=false;for(uint32_t member=r;member!=END&&!overflow;member=nextMember(member)){for(uint32_t dir=0;dir<8;dir++){uint32_t pix;if(!neighbor(member,dir,pix))continue;uint32_t other=owner(pix);visits++;if(other==r||other<loRange||other>=hiRange||(outgoing&&level[other]<=level[r]))continue;if(!add(other,dir>=4)){overflow=true;break;}}}
   if(overflow){uint32_t middle=loRange+(hiRange-loRange)/2;if(middle==loRange||sp>=64)return false;stackLo[sp]=middle;stackHi[sp++]=hiRange;hiRange=middle;replays++;continue;}
   std::sort(slots,slots+used,[this](uint32_t a,uint32_t c){return keys[a]<keys[c];});
   for(uint32_t j=0;j<used;j++){uint32_t s=slots[j],other=keys[s],lo=level[r]<level[other]?r:other,hi=lo==r?other:r;if(!cb(lo,hi,axial[s],diagonal[s]))return false;}
   if(!sp)break;--sp;loRange=stackLo[sp];hiRange=stackHi[sp];
  }return true;
 }
 void buildPaletteCoefficients(){paletteReady=uniqueLevels<=16&&!constant;if(!paletteReady)return;uint32_t k=0;for(uint32_t v=0;v<65536;v++)if(present[v]){paletteRank[v]=uint8_t(k);paletteLevels[k++]=uint16_t(v);}
  for(uint32_t i=0;i<k;i++)for(uint32_t j=i+1;j<k;j++){double d=double(paletteLevels[j])/65535.-double(paletteLevels[i])/65535.,wanted=gain*d/(1+(gain-1)*d),a=d/(8*weak);paletteCoefficients[16*i+j]={std::sqrt(d/(d+median)),wanted,1+std::pow(a,4),wanted*wanted};}
 }
 Edge coefficients(uint32_t lo,uint32_t hi,double d,double m)const{if(paletteReady){const auto&c=paletteCoefficients[16*paletteRank[level[lo]]+paletteRank[level[hi]]];double w=m*c.root/normalizer;return{lo,hi,d,m,w,c.wanted,20*w/c.denominator/c.square};}double w=m*std::sqrt(d/(d+median))/normalizer,wanted=gain*d/(1+(gain-1)*d),a=d/(8*weak);return{lo,hi,d,m,w,wanted,20*w/(1+std::pow(a,4))/(wanted*wanted)};}
 bool collect(uint32_t r,bool outgoing,bool block){return row(r,outgoing,[&](uint32_t lo,uint32_t hi,double d,double m){if(block){uint32_t other=lo==r?hi:lo;bool inside=false;for(uint32_t j=0;j<b;j++)if(blockRoots[j]==other){inside=true;break;}if(inside&&other<r)return;}if(edgeCount>=edgeCapacity){failure=-5;return;}edges[edgeCount++]=coefficients(lo,hi,d,m);});}
 static bool edgeOrder(const Edge&a,const Edge&c){return a.lo<c.lo||(a.lo==c.lo&&a.hi<c.hi);}
 void orderEdges(){std::sort(edges,edges+edgeCount,edgeOrder);}
 void noteQuantileRun(double difference,double mass){if(uniqueLevels>16||!uniformRuns)return;uint32_t i=0;while(i<quantileRunCount&&quantileRuns[i].difference!=difference)i++;if(i==quantileRunCount){if(i==128){uniformRuns=false;return;}quantileRuns[i]={difference,mass,0,0};quantileRunCount++;}else if(quantileRuns[i].mass!=mass){uniformRuns=false;return;}quantileRuns[i].count++;}
 bool beginExactTape(){exactTape=new(std::nothrow)sherloq7c::ExactQuantileTape;if(!exactTape)return false;exactTapeUsed=true;phase=12;at=0;return true;}
 bool beginQuantileReplay(){if(uniqueLevels>16||!uniformRuns||!quantileRunCount)return false;uint64_t terms=0;for(uint32_t i=0;i<quantileRunCount;i++)terms+=quantileRuns[i].count;if(terms!=E)return false;std::sort(quantileRuns,quantileRuns+quantileRunCount,[](const QuantileRun&a,const QuantileRun&b){return a.difference<b.difference;});weak=median=0;replayRun=0;replayPosition=replayedAdditions=0;replayTotal=0;replayedQuantiles=true;phase=11;at=0;return true;}
 bool replayQuantiles(uint32_t&work){while(work&&replayRun<quantileRunCount){auto&run=quantileRuns[replayRun];uint32_t count=uint32_t(std::min(uint64_t(work),run.count-replayPosition));for(uint32_t i=0;i<count;i++)replayTotal+=run.mass;work-=count;replayPosition+=count;replayedAdditions+=count;if(replayPosition==run.count){run.end=replayTotal;replayRun++;replayPosition=0;}}if(replayRun!=quantileRunCount)return false;total=replayTotal;for(uint32_t i=0;i<quantileRunCount;i++){const auto&run=quantileRuns[i];if(!weak&&run.end>=.01*total)weak=run.difference;if(!median&&run.end>=.5*total)median=run.difference;}exactQuantiles=true;quantileError=0;return weak>0&&median>0;}
 bool chooseGaps(){
  total=0;for(uint32_t gap=1;gap<65536;gap++)total+=hist[gap];double gamma=double(E)*U/(1-double(E)*U);quantileError=(4*gamma+64*U)*total;
  double before=0;for(uint32_t gap=1;gap<65536;gap++){double after=before+hist[gap];if(!weakGap&&after>=.01*total){weakGap=gap;prefixWeak=before;}if(!medianGap&&after>=.5*total){medianGap=gap;prefixMedian=before;}before=after;}
  return weakGap&&medianGap;
 }
 bool exactSmallQuantiles(){
  edgeCount=0;normalizer=1;for(uint32_t r=0;r<n;r++)if(isRoot(r))row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){edges[edgeCount++]={lo,hi,d,m,0,0,0};});
  std::sort(edges,edges+edgeCount,[](const Edge&a,const Edge&c){return a.d<c.d||(a.d==c.d&&edgeOrder(a,c));});
  total=0;for(uint32_t j=0;j<edgeCount;j++)total+=edges[j].m;double sum=0;for(uint32_t j=0;j<edgeCount;j++){sum+=edges[j].m;if(!weak&&sum>=.01*total)weak=edges[j].d;if(sum>=.5*total){median=edges[j].d;break;}}
  exactQuantiles=true;return true;
 }
 bool refinedQuantile(uint32_t gap,double prefix,double fraction,double*weights,double&answer){
  uint32_t usedValues=0;for(uint32_t low=0;low+gap<65536;low++)if(weights[low]>0)order[usedValues++]=low;
  auto diff=[gap](uint32_t low){return double(low+gap)/65535.-double(low)/65535.;};
  std::sort(order,order+usedValues,[&](uint32_t a,uint32_t c){double da=diff(a),dc=diff(c);return da<dc||(da==dc&&a<c);});
  double before=prefix,target=fraction*total,guard=(1+fraction)*quantileError+64*U*total;
  for(uint32_t j=0;j<usedValues;){double d=diff(order[j]),m=0;do{m+=weights[order[j++]];}while(j<usedValues&&diff(order[j])==d);double after=before+m;if(after>=target){if(!(target-before>guard&&after-target>guard))return false;answer=d;return true;}before=after;}return false;
 }
 int prepare(uint32_t work){
  while(work&&phase!=10){
   if(phase==0){while(at<n&&work){root[at]=-1;if(!present[level[at]]){present[level[at]]=1;uniqueLevels++;}minimum=std::min(minimum,level[at]);maximum=std::max(maximum,level[at]);at++;work--;}if(at==n){at=0;constant=minimum==maximum;if(constant){C=1;R=n>1?1:0;if(!graph.init(root,level,width,height,C,R,arena,arenaBytes,arenaUsed))return failure=-1;graphReady=true;root=nullptr;phase=9;}else{phase=1;off=0;}}}
   else if(phase==1){while(off<4&&work){while(at<n&&work){uint32_t q,dir=off==0?0:off==1?2:off==2?4:6;if(neighbor(at,dir,q)&&level[at]==level[q]){uint32_t a=find(at),c=find(q);if(a!=c){if(a>c)std::swap(a,c);root[a]+=root[c];root[c]=int32_t(a);}}at++;work--;}if(at==n){at=0;off++;}}if(off==4){phase=2;at=0;}}
   else if(phase==2){while(at<n&&work){if(root[at]<0){C++;if(root[at]<-1)R++;}else root[at]=int32_t(find(at));at++;work--;}
    if(at==n){singleton=C==n;if(!graph.init(root,level,width,height,C,R,arena,arenaBytes,arenaUsed))return failure=-1;phase=3;at=0;}}
   else if(phase==3){int status=graph.step(work);if(status<0)return failure=status;if(status==1){graphReady=true;root=graph.denseRoots;next=graph.nextDense;phase=5;at=0;}}
   else if(phase==5){while(at<n&&work){uint32_t r=at++;if(isRoot(r))row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){hist[level[hi]-level[lo]]+=m;noteQuantileRun(d,m);E++;});work--;}
    if(at==n){at=0;if(!chooseGaps())return failure=-3;if(E<=edgeCapacity){exactSmallQuantiles();phase=8;}else{phase=6;}}}
   else if(phase==6){while(at<n&&work){uint32_t r=at++;if(isRoot(r))row(r,true,[&](uint32_t lo,uint32_t hi,double,double m){uint32_t gap=level[hi]-level[lo];if(gap==weakGap)refine[level[lo]]+=m;if(gap==medianGap)refine[65536+level[lo]]+=m;});work--;}
    if(at==n){if(!refinedQuantile(weakGap,prefixWeak,.01,refine,weak)||!refinedQuantile(medianGap,prefixMedian,.5,refine+65536,median)){if(!beginQuantileReplay()&&!beginExactTape())return failure=-1;}else{exactQuantiles=true;phase=8;at=0;}}}
   else if(phase==11){if(replayQuantiles(work)){phase=8;at=0;}}
   else if(phase==12){while(at<n&&work){uint32_t r=at++;if(isRoot(r)&&!rowCounts(r,true,[&](uint32_t lo,uint32_t hi,uint32_t ax,uint32_t dg){return exactTape->count(level[hi]-level[lo],level[lo],ax,dg);})){return failure=-4;}work--;}
    if(at==n){if(exactTape->terms!=E)return failure=-4;if(!exactTape->finalizeCounts(arena,graph.endOffset,arenaBytes))return failure=-1;exactTapeBytes=exactTape->tapeBytes;exactScratchBytes=exactTape->scratchBytes;exactTemporaryBytes=exactTape->usedBytes;exactTerms=exactTape->terms;arenaUsed=std::max(arenaUsed,graph.endOffset+exactTemporaryBytes);phase=13;at=0;}}
   else if(phase==13){int status=exactTape->clearStep(work);work=0;if(status<0)return failure=-4;if(status==1){phase=14;at=0;}}
   else if(phase==14){while(at<n&&work){uint32_t r=at++;if(isRoot(r)&&!rowCounts(r,true,[&](uint32_t lo,uint32_t hi,uint32_t ax,uint32_t dg){return exactTape->append(level[hi]-level[lo],level[lo],ax,dg);})){return failure=-4;}work--;}
    if(at==n){if(!exactTape->finishAppend())return failure=-4;phase=15;at=0;}}
   else if(phase==15){int status=exactTape->step(work);work=0;if(status<0)return failure=-4;if(status==1){weak=exactTape->weak;median=exactTape->median;total=exactHistoricalTotal=exactTape->total;exactAdditions=exactTape->additions;exactQuantiles=true;quantileError=0;delete exactTape;exactTape=nullptr;phase=8;at=0;}}
   else if(phase==8){if(at==0)normalizer=0;while(at<n&&work){uint32_t r=at++;if(isRoot(r))row(r,true,[&](uint32_t,uint32_t,double d,double m){normalizer+=m*std::sqrt(d/(d+median));});work--;}if(at==n){phase=9;at=0;}}
   else if(phase==9){if(!placeState())return failure=-1;initialRank=hist;hist=nullptr;uint32_t rank=0;for(uint32_t v=0;v<65536;v++)if(present[v])initialRank[v]=uniqueLevels>1?double(rank++)/double(uniqueLevels-1):0;std::free(hist);std::free(refine);std::free(order);hist=refine=nullptr;order=nullptr;phase=10;}
  }return phase==10?1:0;
 }
 bool seen(uint32_t r)const{uint32_t i=cid(r);return (visited[i>>3]>>(i&7))&1;}
 void mark(uint32_t r){uint32_t i=cid(r);visited[i>>3]|=uint8_t(1U<<(i&7));}
 void selectBlock(){
  b=0;while(scan<n&&(!isRoot(scan)||seen(scan)))scan++;if(scan==n)return;uint32_t seed=scan++;blockRoots[b++]=seed;mark(seed);
  uint32_t candidates[4096],candidateCount=0;double strengths[4096];
  for(uint32_t expanded=0;expanded<b&&b<blockSize;expanded++){
   uint32_t r=blockRoots[expanded];row(r,false,[&](uint32_t lo,uint32_t hi,double d,double m){uint32_t other=lo==r?hi:lo;if(seen(other))return;Edge e=coefficients(lo,hi,d,m);double slack=Y(hi)-Y(lo)-.1*d,strength=e.w/(slack*slack)+e.fidelity;uint32_t j=0;while(j<candidateCount&&candidates[j]!=other)j++;if(j<candidateCount){strengths[j]+=strength;return;}if(candidateCount<4096){candidates[candidateCount]=other;strengths[candidateCount++]=strength;}else{uint32_t weakest=0;for(uint32_t k=1;k<candidateCount;k++)if(strengths[k]<strengths[weakest])weakest=k;if(strength>strengths[weakest]){candidates[weakest]=other;strengths[weakest]=strength;}}});
   if(expanded+1==b){uint32_t strongest=END;for(uint32_t j=0;j<candidateCount;j++)if(!seen(candidates[j])&&(strongest==END||strengths[j]>strengths[strongest]))strongest=j;if(strongest!=END){uint32_t other=candidates[strongest];blockRoots[b++]=other;mark(other);}}
  }
 }
 int index(uint32_t r)const{for(uint32_t j=0;j<b;j++)if(blockRoots[j]==r)return int(j);return -1;}
 void solveBlock(){
  blockSolves++;edgeCount=0;for(uint32_t j=0;j<b;j++)if(!collect(blockRoots[j],false,true))failure=-5;if(failure)return;orderEdges();
  double g[32],h[1024],s[32],localTolerance=maxError<0?1e-10:std::max(1e-14,maxError*.05);
  for(uint32_t iteration=0;iteration<innerSteps;iteration++){
   std::fill(g,g+b,0);std::fill(h,h+b*b,0);for(uint32_t j=0;j<b;j++){uint32_t r=blockRoots[j];double v=Y(r),a=.1*count(r)/n;g[j]=a*(-1/v+1/(1-v));h[j*b+j]=a*(1/(v*v)+1/((1-v)*(1-v)));}
   for(uint32_t j=0;j<edgeCount;j++){const Edge&e=edges[j];int l=index(e.lo),r=index(e.hi);double delta=Y(e.hi)-Y(e.lo),slack=delta-.1*e.d,force=-e.w/slack+e.fidelity*(delta-e.wanted),curve=e.w/(slack*slack)+e.fidelity;if(l>=0){g[l]-=force;h[l*b+l]+=curve;}if(r>=0){g[r]+=force;h[r*b+r]+=curve;}if(l>=0&&r>=0){h[l*b+r]-=curve;h[r*b+l]-=curve;}}
   double bound=0;for(uint32_t j=0;j<b;j++)bound=std::max(bound,std::abs(g[j])/(.8*count(blockRoots[j])/n));if(bound<=localTolerance)break;
   for(uint32_t i=0;i<b;i++)for(uint32_t j=0;j<=i;j++){double v=h[i*b+j];for(uint32_t k=0;k<j;k++)v-=h[i*b+k]*h[j*b+k];if(i==j){if(!(v>0&&std::isfinite(v))){failure=-4;return;}h[i*b+j]=std::sqrt(v);}else h[i*b+j]=v/h[j*b+j];}
   for(uint32_t i=0;i<b;i++){double v=-g[i];for(uint32_t j=0;j<i;j++)v-=h[i*b+j]*s[j];s[i]=v/h[i*b+i];}for(int i=int(b)-1;i>=0;i--){double v=s[i];for(uint32_t j=i+1;j<b;j++)v-=h[j*b+i]*s[j];s[i]=v/h[i*b+i];}
   double directional=0,rho=1;for(uint32_t j=0;j<b;j++){double v=Y(blockRoots[j]),d=s[j];directional+=g[j]*d;if(d<0)rho=std::min(rho,-.99*v/d);if(d>0)rho=std::min(rho,.99*(1-v)/d);}if(!(directional<0))break;
   for(uint32_t j=0;j<edgeCount;j++){const Edge&e=edges[j];int l=index(e.lo),r=index(e.hi);double ds=(r<0?0:s[r])-(l<0?0:s[l]);if(ds<0)rho=std::min(rho,-.99*(Y(e.hi)-Y(e.lo)-.1*e.d)/ds);}
   bool accepted=false;for(uint32_t back=0;back<55;back++){
    double deltaObjective=0;for(uint32_t j=0;j<b;j++){uint32_t r=blockRoots[j];double v=Y(r),dv=rho*s[j];if(!(v+dv>0&&v+dv<1)){deltaObjective=INFINITY;break;}deltaObjective-=.1*count(r)/n*(std::log1p(dv/v)+std::log1p(-dv/(1-v)));}
    for(uint32_t j=0;j<edgeCount&&std::isfinite(deltaObjective);j++){const Edge&e=edges[j];int l=index(e.lo),r=index(e.hi);double delta=Y(e.hi)-Y(e.lo),ds=rho*((r<0?0:s[r])-(l<0?0:s[l])),lo=Y(e.lo)+(l<0?0:rho*s[l]),hi=Y(e.hi)+(r<0?0:rho*s[r]),slack=delta-.1*e.d;if(!(hi-lo-.1*e.d>0)){deltaObjective=INFINITY;break;}deltaObjective+=-e.w*std::log1p(ds/slack)+.5*e.fidelity*ds*(2*(delta-e.wanted)+ds);}
    if(deltaObjective<=1e-4*rho*directional){for(uint32_t j=0;j<b;j++)Y(blockRoots[j])+=rho*s[j];accepted=true;localSteps++;break;}rho*=.5;
   }if(!accepted)break;
  }
 }
 template<class Callback>void canonicalRow(uint32_t r,Callback callback){
  // Identity neighbours of an isolated pixel already have a fixed spatial
  // order. Emit the three canonical groups directly, without sorting or an
  // Edge scratch write. Any adjacent nontrivial component uses the exact
  // general merger below.
  if(singleton||count(r)==1){static constexpr uint32_t dirs[8]={5,3,7,1,0,6,2,4};uint32_t ids[8],directions[8],used=0;bool identity=true;
   for(uint32_t k=0;k<8;k++){uint32_t other;if(neighbor(r,dirs[k],other)){if(!singleton&&(owner(other)!=other||count(other)!=1)){identity=false;break;}ids[used]=other;directions[used++]=dirs[k];}}
   if(identity){for(uint32_t group=0;group<3;group++)for(uint32_t k=0;k<used;k++){uint32_t other=ids[k];bool incoming=level[other]<level[r];if(group==0?incoming&&other<r:group==1?!incoming:incoming&&other>r){uint32_t lo=incoming?other:r,hi=incoming?r:other;callback(coefficients(lo,hi,value(hi)-value(lo),directions[k]<4?1.:Q));}}return;}
  }
  if(count(r)*8<=edgeCapacity){edgeCount=0;collect(r,false,false);orderEdges();for(uint32_t j=0;j<edgeCount;j++)callback(edges[j]);return;}
  row(r,false,[&](uint32_t lo,uint32_t hi,double d,double m){if(hi==r&&lo<r)callback(coefficients(lo,hi,d,m));});
  row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){callback(coefficients(lo,hi,d,m));});
  row(r,false,[&](uint32_t lo,uint32_t hi,double d,double m){if(hi==r&&lo>r)callback(coefficients(lo,hi,d,m));});
 }
 void certificateReduction(uint32_t r,double g,double absolute){
  double v=Y(r),a=count(r)/n;
  if(!std::isfinite(g)||!(v>0&&v<1)){failure=-4;return;}
  double linear=std::abs(g)/(.8*a),h=-1/v+1/(1-v),t=h-g/(.1*a),inverse=t>=0?1-2/(2+t+std::hypot(t,2)):2/(2-t+std::hypot(t,2)),nonlinear=std::abs(v-inverse)+64*std::numeric_limits<double>::epsilon();
  certGradientNorm+=g*g;if(cgResidual)CV(cgResidual,r)=float(-g);certNorm+=g*g/a;certLinear=std::max(certLinear,linear);certNonlinear=std::max(certNonlinear,nonlinear);certMax=std::max(certMax,std::min(linear,nonlinear));certRound=std::max(certRound,128*std::numeric_limits<double>::epsilon()*(1+absolute)/(.8*a));
 }
 void certificateRow(uint32_t r){
  double v=Y(r),a=count(r)/n,g=.1*a*(-1/v+1/(1-v)),absolute=.1*a*(1/v+1/(1-v));edgeCount=0;
  canonicalRow(r,[&](const Edge&e){double delta=Y(e.hi)-Y(e.lo),slack=delta-.1*e.d;if(!(slack>0)){failure=-4;return;}double force=-e.w/slack+e.fidelity*(delta-e.wanted);g+=r==e.hi?force:-force;absolute+=e.w/slack+std::abs(e.fidelity*(delta-e.wanted));});
  certificateReduction(r,g,absolute);
 }
 double&certificateAbsolute(uint32_t i){return i<certAbsoluteFirst?certAbsolute0[i]:certAbsolute1[i-certAbsoluteFirst];}
 bool certificateScratch(){
  if(!cgStep||!cgResidual||!cgDirection||!curveCodes)return false;
  const uintptr_t g=reinterpret_cast<uintptr_t>(cgResidual),step=reinterpret_cast<uintptr_t>(cgStep),curve=reinterpret_cast<uintptr_t>(curveCodes),aligned=(step+7)&~uintptr_t(7);
  const uint64_t skipped=aligned-step,stepBytes=4ULL*C;
  if((g&7)||(curve&7)||reinterpret_cast<uintptr_t>(cgDirection)!=g+4ULL*C||skipped>stepBytes)return false;
  certAbsoluteFirst=uint32_t((stepBytes-skipped)/8);
  if(8ULL*(C-certAbsoluteFirst)>6ULL*n)return false;
  certGradient=reinterpret_cast<double*>(cgResidual);certAbsolute0=reinterpret_cast<double*>(aligned);certAbsolute1=reinterpret_cast<double*>(curveCodes);return true;
 }
 void certificateInitialize(uint32_t r){const double v=Y(r),a=count(r)/n;const uint32_t i=cid(r);certGradient[i]=.1*a*(-1/v+1/(1-v));certificateAbsolute(i)=.1*a*(1/v+1/(1-v));}
 void certificateEdges(uint32_t r){
  // Canonical global order (lo representative, hi representative) gives every
  // component exactly the same addition subsequence as canonicalRow.
  const uint32_t rootIndex=cid(r);double gradient=certGradient[rootIndex],absoluteRoot=certificateAbsolute(rootIndex);
  row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){if(failure)return;const Edge e=coefficients(lo,hi,d,m);const double delta=Y(hi)-Y(lo),slack=delta-.1*d;if(!(slack>0)){failure=-4;return;}
   const double force=-e.w/slack+e.fidelity*(delta-e.wanted),absolute=e.w/slack+std::abs(e.fidelity*(delta-e.wanted));const uint32_t h=cid(hi);
   gradient+=-force;certGradient[h]+=force;absoluteRoot+=absolute;certificateAbsolute(h)+=absolute;certEdgeEvaluations++;
  });
  certGradient[rootIndex]=gradient;certificateAbsolute(rootIndex)=absoluteRoot;
 }
 // Identity components have only local pixel neighbors. Reuse only the
 // direction prefix: residual writes cannot touch a live gradient/absolute slot.
 bool certificateRingScratch(){
  certRingLength=0;if(!singleton||C!=n||!cgDirection||!cgResidual)return false;
  const uintptr_t start=reinterpret_cast<uintptr_t>(cgDirection),aligned=(start+7)&~uintptr_t(7);
  const uint64_t length=2ULL*width+3,bytes=16*length,padding=aligned-start;
  if(padding+bytes>4ULL*C)return false;
  certRingLength=uint32_t(length);certRingGradient=reinterpret_cast<double*>(aligned);certRingAbsolute=certRingGradient+certRingLength;
  certRingInitialized=certRingReduced=certRingRootSlot=certRingInitSlot=certRingReduceSlot=0;return true;
 }
 void certificateRingInitialize(){const uint32_t r=certRingInitialized++,slot=certRingInitSlot;const double v=Y(r),a=count(r)/n;certRingGradient[slot]=.1*a*(-1/v+1/(1-v));certRingAbsolute[slot]=.1*a*(1/v+1/(1-v));if(++certRingInitSlot==certRingLength)certRingInitSlot=0;}
 void certificateRingEdges(uint32_t r){
  const uint32_t slot=certRingRootSlot;double gradient=certRingGradient[slot],absoluteRoot=certRingAbsolute[slot];
  row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){if(failure)return;const Edge e=coefficients(lo,hi,d,m);const double delta=Y(hi)-Y(lo),slack=delta-.1*d;if(!(slack>0)){failure=-4;return;}
   const double force=-e.w/slack+e.fidelity*(delta-e.wanted),absolute=e.w/slack+std::abs(e.fidelity*(delta-e.wanted));const int32_t distance=int32_t(hi)-int32_t(r);int32_t h=int32_t(slot)+distance;
   if(h<0)h+=int32_t(certRingLength);else if(uint32_t(h)>=certRingLength)h-=int32_t(certRingLength);
   gradient+=-force;certRingGradient[h]+=force;absoluteRoot+=absolute;certRingAbsolute[h]+=absolute;certEdgeEvaluations++;
  });
  certRingGradient[slot]=gradient;certRingAbsolute[slot]=absoluteRoot;if(++certRingRootSlot==certRingLength)certRingRootSlot=0;
 }
 void certificateRingReduce(){const uint32_t r=certRingReduced++,slot=certRingReduceSlot;certificateReduction(r,certRingGradient[slot],certRingAbsolute[slot]);if(++certRingReduceSlot==certRingLength)certRingReduceSlot=0;}
 void beginCert(){certRingPass=certificateRingScratch();certSingleEdgePass=certRingPass||certificateScratch();state=certRingPass?55:certSingleEdgePass?52:1;scan=0;certGradientNorm=certNorm=certMax=certRound=certLinear=certNonlinear=0;certPasses++;}
 void beginCoarse(){state=3;scan=0;coarseH00=coarseWeighted=0;}
 struct Row {double g,diag,product;uint32_t strongest;double coupling;};
 uint32_t curveCode(double curve){float f=float(curve);uint32_t bits;std::memcpy(&bits,&f,4);uint32_t q=(bits+0x40000U)>>19;if(q>4079){q=4079;curveClampCount++;}if(!q&&curve>0){q=1;curveClampCount++;}return q;}
 void buildCurves(uint32_t p){uint32_t codes[4]{};for(uint32_t k=0;k<4;k++){uint32_t q,dir=k==0?0:k==1?2:k==2?4:6;if(!neighbor(p,dir,q))continue;uint32_t a=owner(p),b=owner(q);if(a==b)continue;uint32_t lo=level[a]<level[b]?a:b,hi=lo==a?b:a,gap=level[hi]-level[lo];double d=value(hi)-value(lo),slack=Y(hi)-Y(lo)-.1*d,m=k<2?1.:Q,curve=m*(lookupW[gap]/(slack*slack)+lookupF[gap]);codes[k]=curveCode(curve);}
  const uint64_t at=uint64_t(p)*3;curveCodes[at]=uint16_t(codes[0]|(codes[1]<<12));curveCodes[at+1]=uint16_t((codes[1]>>4)|(codes[2]<<8));curveCodes[at+2]=uint16_t((codes[2]>>8)|(codes[3]<<4));
 }
 double curvature(uint32_t p,uint32_t direction)const{uint32_t edge,which;switch(direction){case 0:edge=p;which=0;break;case 1:edge=p-1;which=0;break;case 2:edge=p;which=1;break;case 3:edge=p-width;which=1;break;case 4:edge=p;which=2;break;case 5:edge=p-width-1;which=2;break;case 6:edge=p;which=3;break;default:edge=p-width+1;which=3;break;}
  const uint64_t at=uint64_t(edge)*3;uint32_t code=which==0?curveCodes[at]&4095:which==1?(curveCodes[at]>>12)|((curveCodes[at+1]&255)<<4):which==2?(curveCodes[at+1]>>8)|((curveCodes[at+2]&15)<<8):curveCodes[at+2]>>4;return curveTable[code];
 }
 Row cachedRow(uint32_t r,const float*vector){const double areaCount=count(r),vectorValue=vector?double(vector[cid(r)]):0;double v=Y(r),a=.1*areaCount/n,diag=a*(1/(v*v)+1/((1-v)*(1-v))),product=vector?diag*vectorValue:0,strong=0;uint32_t strongest=END;bool single=areaCount==1;uint32_t ids[8],used=0;double curves[8]{};
  for(uint32_t member=r;member!=END;member=single?END:nextMember(member))for(uint32_t dir=0;dir<8;dir++){uint32_t pixel;if(!neighbor(member,dir,pixel))continue;double curve=curvature(member,dir);if(!curve)continue;uint32_t other=owner(pixel);diag+=curve;if(vector)product+=curve*(vectorValue-double(CV(vector,other)));else if(single){uint32_t j=0;while(j<used&&ids[j]!=other)j++;if(j==used)ids[used++]=other;curves[j]+=curve;}}
  if(!vector&&single)for(uint32_t j=0;j<used;j++)if(curves[j]>strong){strong=curves[j];strongest=ids[j];}
  return{0,diag,product,strongest,strong};
 }
 Row derivatives(uint32_t r,const float*vector,bool approximate){
  if(approximate&&cached)return cachedRow(r,vector);
  double v=Y(r),a=.1*count(r)/n,diag=a*(1/(v*v)+1/((1-v)*(1-v))),g=a*(-1/v+1/(1-v)),product=vector?diag*CV(vector,r):0,coupling=0;uint32_t strongest=END;
  if(approximate&&vector&&(singleton||count(r)==1)){for(uint32_t dir=0;dir<8;dir++){uint32_t pixel;if(!neighbor(r,dir,pixel))continue;uint32_t other=owner(pixel);uint32_t lo=level[r]<level[other]?r:other,hi=lo==r?other:r,gap=level[hi]-level[lo];double d=value(hi)-value(lo),delta=Y(hi)-Y(lo),slack=delta-.1*d,m=dir<4?1.:Q,curve=m*(lookupW[gap]/(slack*slack)+lookupF[gap]);diag+=curve;if(vector)product+=curve*(double(CV(vector,r))-double(CV(vector,other)));}}
  else if(approximate){row(r,false,[&](uint32_t lo,uint32_t hi,double d,double m){uint32_t other=lo==r?hi:lo,gap=level[hi]-level[lo];double delta=Y(hi)-Y(lo),slack=delta-.1*d,curve=m*(lookupW[gap]/(slack*slack)+lookupF[gap]);diag+=curve;if(curve>coupling){coupling=curve;strongest=other;}if(vector)product+=curve*(double(CV(vector,r))-double(CV(vector,other)));});}
  else{canonicalRow(r,[&](const Edge&e){double delta=Y(e.hi)-Y(e.lo),slack=delta-.1*e.d,force=-e.w/slack+e.fidelity*(delta-e.wanted),curve=e.w/(slack*slack)+e.fidelity;g+=r==e.hi?force:-force;diag+=curve;if(vector){uint32_t other=r==e.lo?e.hi:e.lo;product+=curve*(double(CV(vector,r))-double(CV(vector,other)));}});}
  return{g,diag,product,strongest,coupling};
 }
 double triangularPrecondition(uint32_t r,bool backward){double v=Y(r),a=.1*count(r)/n,diag=a*(1/(v*v)+1/((1-v)*(1-v))),sum=0;row(r,false,[&](uint32_t lo,uint32_t hi,double d,double m){uint32_t other=lo==r?hi:lo,gap=level[hi]-level[lo];double slack=Y(hi)-Y(lo)-.1*d,curve=m*(lookupW[gap]/(slack*slack)+lookupF[gap]);diag+=curve;if(backward?other>r:other<r)sum+=curve*double(CV(cgProduct,other));});return backward?double(CV(cgProduct,r))+sum/diag:(double(CV(cgResidual,r))+sum)/diag;}
 uint32_t pairCode(uint32_t pixel)const{return (pairDirections[pixel>>1]>>((pixel&1)*4))&15;}
 void pairCandidate(uint32_t r){uint32_t code=0;if(isRoot(r)&&count(r)==1){Row a=cachedRow(r,nullptr);if(a.strongest!=END&&a.coupling>.5*a.diag&&count(a.strongest)==1)for(uint32_t dir=0;dir<8;dir++){uint32_t q;if(neighbor(r,dir,q)&&q==a.strongest){code=dir+1;break;}}}if(r&1)pairDirections[r>>1]|=uint8_t(code<<4);else pairDirections[r>>1]=uint8_t(code);}
 void confirmPair(uint32_t r){uint32_t code=pairCode(r);if(!code)return;uint32_t other,back;bool valid=neighbor(r,code-1,other);uint32_t otherCode=valid?pairCode(other):0;valid=valid&&otherCode&&neighbor(other,otherCode-1,back)&&back==r;if(valid)matchedPairVertices++;else pairDirections[r>>1]&=uint8_t(~(15U<<((r&1)*4)));}
 double cachedDiagonal(uint32_t r){const double areaCount=count(r);double v=Y(r),a=.1*areaCount/n,diag=a*(1/(v*v)+1/((1-v)*(1-v)));bool single=areaCount==1;for(uint32_t member=r;member!=END;member=single?END:nextMember(member))for(uint32_t dir=0;dir<8;dir++){uint32_t pixel;if(!neighbor(member,dir,pixel))continue;double curve=curvature(member,dir);if(curve)diag+=curve;}return diag;}
 double precondition(uint32_t r){if(cached&&pairCacheReady){double a=cachedDiagonal(r);uint32_t code=pairCode(r);if(code){uint32_t other;neighbor(r,code-1,other);double b=cachedDiagonal(other),k=std::min(curvature(r,code-1),curvature(other,pairCode(other)-1)),det=(a-k)*b+k*(b-k);if(det>0)return (b*double(CV(cgResidual,r))+k*double(CV(cgResidual,other)))/det;}return double(CV(cgResidual,r))/a;}Row a=derivatives(r,nullptr,true);if(a.strongest!=END&&a.coupling>.5*a.diag){Row b=derivatives(a.strongest,nullptr,true);if(b.strongest==r&&b.coupling>.5*b.diag){double k=std::min(a.coupling,b.coupling),det=(a.diag-k)*b.diag+k*(b.diag-k);if(det>0)return (b.diag*double(CV(cgResidual,r))+k*double(CV(cgResidual,a.strongest)))/det;}}return double(CV(cgResidual,r))/a.diag;}
 uint32_t knot(uint32_t r,double&fraction)const{double position=double(level[r])*63./65535.;uint32_t lo=std::min(62U,uint32_t(position));fraction=position-lo;return lo;}
 double knotDirection(uint32_t r)const{double f;uint32_t lo=knot(r,f);return (1-f)*knotStep[lo]+f*knotStep[lo+1];}
 void beginKnots(){state=40;scan=0;std::fill(knotG,knotG+64,0);std::fill(knotH,knotH+4096,0);}
 void knotDerivative(uint32_t r){
  double f;uint32_t lo=knot(r,f);double v=Y(r),a=.1*count(r)/n,g=a*(-1/v+1/(1-v)),curvature=a*(1/(v*v)+1/((1-v)*(1-v))),weights[2]={1-f,f};
  for(uint32_t i=0;i<2;i++){knotG[lo+i]+=weights[i]*g;for(uint32_t j=0;j<2;j++)knotH[(lo+i)*64+lo+j]+=curvature*weights[i]*weights[j];}
  row(r,true,[&](uint32_t low,uint32_t high,double d,double m){Edge e=coefficients(low,high,d,m);double fl,fh;uint32_t il=knot(low,fl),ih=knot(high,fh);uint32_t ids[4]={il,il+1,ih,ih+1};double a[4]={fl-1,-fl,1-fh,fh},delta=Y(high)-Y(low),slack=delta-.1*d,force=-e.w/slack+e.fidelity*(delta-e.wanted),curve=e.w/(slack*slack)+e.fidelity;for(uint32_t i=0;i<4;i++){knotG[ids[i]]+=force*a[i];for(uint32_t j=0;j<4;j++)knotH[ids[i]*64+ids[j]]+=curve*a[i]*a[j];}});
 }
 bool solveKnots(){
  double trace=0;for(uint32_t i=0;i<64;i++)trace+=knotH[i*64+i];for(uint32_t i=0;i<64;i++)knotH[i*64+i]+=std::max(1e-15,trace*1e-14/64);
  for(uint32_t i=0;i<64;i++)for(uint32_t j=0;j<=i;j++){double v=knotH[i*64+j];for(uint32_t k=0;k<j;k++)v-=knotH[i*64+k]*knotH[j*64+k];if(i==j){if(!(v>0&&std::isfinite(v)))return false;knotH[i*64+j]=std::sqrt(v);}else knotH[i*64+j]=v/knotH[j*64+j];}
  for(uint32_t i=0;i<64;i++){double v=-knotG[i];for(uint32_t j=0;j<i;j++)v-=knotH[i*64+j]*knotStep[j];knotStep[i]=v/knotH[i*64+i];}for(int i=63;i>=0;i--){double v=knotStep[i];for(uint32_t j=i+1;j<64;j++)v-=knotH[j*64+i]*knotStep[j];knotStep[i]=v/knotH[i*64+i];}
  directional=0;for(uint32_t i=0;i<64;i++)directional+=knotG[i]*knotStep[i];return directional<0;
 }
 void beginNewton(){pairCacheReady=false;state=cached?45:30;scan=0;gradientNorm=certGradientNorm;rz=0;cgAt=restarts=0;}
 void beginMixedLine(bool fallback=false){state=35;scan=0;directional=0;rate=1;gradientFallback=fallback;}
 int begin(double requestedMicro,double requestedError,double tolerance,uint32_t maximumSweeps,uint32_t requestedBlock,uint32_t requestedInner,bool mixed,bool requestedSgs,uint32_t requestedVectors){
  if(failure)return failure;
  if(phase!=10||!(requestedMicro>=0&&requestedMicro<=1)||requestedBlock<1||requestedBlock>32||!requestedInner)return -2;
  certEdgeEvaluations=certPasses=0;pairCacheReady=false;pairBuilds=0;matchedPairVertices=0;knotIterations=0;seedProvided=seedAccepted=skipWarmup=warmupTooWide=false;cgTotal=totalRestarts=trueChecks=0;curveClampCount=curveBuilds=localSteps=blockSolves=coarseAccepted=0;useMixed=mixed;sgs=false;cached=mixed;threeVectors=mixed;
  if(mixed){if(!lookupW&&!alloc(lookupW,65536))return failure=-1;if(!lookupF&&!alloc(lookupF,65536))return failure=-1;}
  if(cached)for(uint32_t code=0;code<4096;code++){uint32_t bits=code<<19;float f;std::memcpy(&f,&bits,4);curveTable[code]=f;}micro=requestedMicro;maxError=requestedError;rmsTolerance=tolerance;maxSweeps=maximumSweeps;blockSize=requestedBlock;innerSteps=requestedInner;gain=std::max(4*std::pow(16,micro),(.5+7.5*micro)/(255*weak));buildPaletteCoefficients();scan=0;state=0;sweeps=0;converged=false;maxBound=rmsBound=INFINITY;
  if(mixed&&!constant)for(uint32_t gap=1;gap<65536;gap++){double d=double(gap)/65535.,w=std::sqrt(d/(d+median))/normalizer,wanted=gain*d/(1+(gain-1)*d),a=d/(8*weak);lookupW[gap]=w;lookupF[gap]=20*w/(1+std::pow(a,4))/(wanted*wanted);}return 0;
 }
 int solve(uint32_t work){
  if(failure)return failure;
  while(work&&state!=20){
   if(state==0){while(scan<n&&work){if(constant||isRoot(scan))Y(scan)=constant?value(scan):.1*value(scan)+.9*(.01+.98*initialRank[level[scan]]);scan++;work--;}if(scan==n){if(constant){maxBound=rmsBound=0;converged=true;state=20;}else if(seedProvided){state=46;scan=0;change=0;}else if(useMixed){knotIterations=0;beginKnots();}else beginCert();}}
   else if(state==1||state==54){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){if(state==54){const uint32_t i=cid(r);certificateReduction(r,certGradient[i],certificateAbsolute(i));}else certificateRow(r);}if(failure)return failure;work--;}if(scan==n){maxBound=certMax;roundoff=certRound;rmsBound=std::sqrt(certNorm)/.8;converged=maxError<0?rmsBound<=rmsTolerance:maxBound<=maxError;if(converged||sweeps>=maxSweeps){state=20;break;}if(useMixed&&(sweeps>=3||warmupTooWide||skipWarmup))beginNewton();else{state=2;scan=0;std::memset(visited,0,(size_t(C)+7)/8);}}}
   else if(state==52){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))certificateInitialize(r);work--;}if(scan==n){state=53;scan=0;}}
   else if(state==53){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))certificateEdges(r);if(failure)return failure;work--;}if(scan==n){state=54;scan=0;}}
   else if(state==55){
    while(work&&certRingReduced<n){
     // Reduce before initializing a reused slot. The previous row is the last
     // possible low representative of this pixel (distance at most width+1).
     if(scan==n||uint64_t(certRingReduced)+width+1<scan){certificateRingReduce();work--;}
     else if(certRingInitialized<std::min<uint64_t>(n,uint64_t(scan)+width+2)){certificateRingInitialize();work--;}
     else{certificateRingEdges(scan++);work--;}
     if(failure)return failure;
    }
    if(certRingReduced==n){state=54;scan=n;}
   }
   else if(state==40){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))knotDerivative(r);work--;}if(scan==n){if(solveKnots()){state=41;scan=0;rate=1;}else beginCert();}}
   else if(state==41){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),s=knotDirection(r);if(s<0)rate=std::min(rate,-.99*v/s);if(s>0)rate=std::min(rate,.99*(1-v)/s);row(r,true,[&](uint32_t lo,uint32_t hi,double d,double){double ds=knotDirection(hi)-knotDirection(lo);if(ds<0)rate=std::min(rate,-.99*(Y(hi)-Y(lo)-.1*d)/ds);});}work--;}if(scan==n){state=42;scan=0;change=0;backtracks=0;}}
   else if(state==42){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),dv=rate*knotDirection(r),nv=v+dv;if(!(nv>0&&nv<1))change=INFINITY;else change-=.1*count(r)/n*(std::log1p(dv/v)+std::log1p(-dv/(1-v)));row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){Edge e=coefficients(lo,hi,d,m);double delta=Y(hi)-Y(lo),ds=rate*(knotDirection(hi)-knotDirection(lo)),slack=delta-.1*d,loNext=Y(lo)+rate*knotDirection(lo),hiNext=Y(hi)+rate*knotDirection(hi);if(!(hiNext-loNext-.1*d>0))change=INFINITY;else change+=-e.w*std::log1p(ds/slack)+.5*e.fidelity*ds*(2*(delta-e.wanted)+ds);});}work--;}
    if(scan==n){if(change<=1e-4*rate*directional){state=43;scan=0;}else if(++backtracks<55){rate*=.5;scan=0;change=0;}else beginCert();}}
   else if(state==43){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))Y(r)+=rate*knotDirection(r);work--;}if(scan==n){knotIterations++;if(knotIterations<8)beginKnots();else beginCert();}}
   else if(state==46){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),next=CV(cgStep,r),dv=next-v;if(!(next>0&&next<1))change=INFINITY;else change-=.1*count(r)/n*(std::log1p(dv/v)+std::log1p(-dv/(1-v)));row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){Edge e=coefficients(lo,hi,d,m);double delta=Y(hi)-Y(lo),nextDelta=double(CV(cgStep,hi))-double(CV(cgStep,lo)),ds=nextDelta-delta,slack=delta-.1*d;if(!(nextDelta-.1*d>0))change=INFINITY;else change+=-e.w*std::log1p(ds/slack)+.5*e.fidelity*ds*(2*(delta-e.wanted)+ds);});}work--;}
    if(scan==n){if(change<=0&&std::isfinite(change)){seedAccepted=true;skipWarmup=true;state=47;scan=0;}else{knotIterations=0;beginKnots();}}}
   else if(state==47){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))Y(r)=CV(cgStep,r);work--;}if(scan==n)beginCert();}
   else if(state==45){while(scan<n&&work){buildCurves(scan++);work--;}if(scan==n){curveBuilds++;state=50;scan=0;}}
   else if(state==50){while(scan<n&&work){pairCandidate(scan++);work--;}if(scan==n){state=51;scan=0;matchedPairVertices=0;}}
   else if(state==51){while(scan<n&&work){confirmPair(scan++);work--;}if(scan==n){pairCacheReady=true;pairBuilds++;state=30;scan=0;}}
   else if(state==30){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){CV(cgStep,r)=0;CV(cgDirection,r)=0;}work--;}if(scan==n){double relative=maxError==.002?.1:std::min(.1,std::max(1e-8,rmsBound*.01));cgThreshold=relative*relative*gradientNorm;state=34;scan=0;nextRz=0;initialPrecond=true;}}
   else if(state==31){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){float ap=float(derivatives(r,cgDirection,true).product);if(!threeVectors)CV(cgProduct,r)=ap;denominator+=double(CV(cgDirection,r))*double(ap);}work--;}if(scan==n){if(!(denominator>0&&std::isfinite(denominator))){beginMixedLine();}else{alpha=rz/denominator;residualNorm=0;state=32;scan=0;}}}
   else if(state==32){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){CV(cgStep,r)=float(double(CV(cgStep,r))+alpha*double(CV(cgDirection,r)));float ap=threeVectors?float(derivatives(r,cgDirection,true).product):CV(cgProduct,r);CV(cgResidual,r)=float(double(CV(cgResidual,r))-alpha*double(ap));residualNorm+=double(CV(cgResidual,r))*double(CV(cgResidual,r));}work--;}if(scan==n){cgAt++;cgTotal++;if(residualNorm<=cgThreshold||cgAt>=2000){state=33;scan=0;trueNorm=nextRz=directional=0;rate=1;}else{state=34;scan=0;nextRz=0;}}}
   else if(state==33){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){Row row=derivatives(r,cgStep,false);double residual=-(row.g+row.product);trueNorm+=residual*residual;CV(cgResidual,r)=float(residual);double step=CV(cgStep,r),v=Y(r);directional+=row.g*step;if(step<0)rate=std::min(rate,-.99*v/step);if(step>0)rate=std::min(rate,.99*(1-v)/step);}work--;}if(scan==n){trueChecks++;if(trueNorm<=cgThreshold||restarts>=2||cgAt>=2000){if(directional<0){state=39;scan=0;}else beginMixedLine(true);}else{restarts++;totalRestarts++;state=34;scan=0;nextRz=0;initialPrecond=true;}}}
   else if(state==34){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){float z=float(sgs?triangularPrecondition(r,false):precondition(r));if(!threeVectors)CV(cgProduct,r)=z;if(!sgs)nextRz+=double(CV(cgResidual,r))*double(z);}work--;}if(scan==n){if(sgs){state=44;scan=n;}else{beta=initialPrecond?0:nextRz/rz;initialPrecond=false;rz=nextRz;state=36;scan=0;}}}
   else if(state==44){while(scan&&work){uint32_t r=--scan;if(isRoot(r)){CV(cgProduct,r)=float(triangularPrecondition(r,true));nextRz+=double(CV(cgResidual,r))*double(CV(cgProduct,r));}work--;}if(!scan){beta=initialPrecond?0:nextRz/rz;initialPrecond=false;rz=nextRz;state=36;scan=0;}}
   else if(state==36){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))CV(cgDirection,r)=float(double(threeVectors?float(precondition(r)):CV(cgProduct,r))+beta*double(CV(cgDirection,r)));work--;}if(scan==n){state=31;scan=0;denominator=0;}}
   else if(state==35){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){Row row=derivatives(r,nullptr,false);if(gradientFallback)CV(cgStep,r)=float(-row.g/row.diag);double step=CV(cgStep,r),v=Y(r);directional+=row.g*step;if(step<0)rate=std::min(rate,-.99*v/step);if(step>0)rate=std::min(rate,.99*(1-v)/step);}work--;}if(scan==n){if(!(directional<0)&&!gradientFallback)beginMixedLine(true);else if(!(directional<0)){failure=-4;return failure;}else{state=39;scan=0;}}}
   else if(state==39){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))row(r,true,[&](uint32_t lo,uint32_t hi,double d,double){double ds=double(CV(cgStep,hi))-double(CV(cgStep,lo));if(ds<0)rate=std::min(rate,-.99*(Y(hi)-Y(lo)-.1*d)/ds);});work--;}if(scan==n){state=37;scan=0;change=0;backtracks=0;}}
   else if(state==37){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),dv=rate*double(CV(cgStep,r)),nv=v+dv;if(!(nv>0&&nv<1))change=INFINITY;else change-=.1*count(r)/n*(std::log1p(dv/v)+std::log1p(-dv/(1-v)));row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){Edge e=coefficients(lo,hi,d,m);double delta=Y(hi)-Y(lo),ds=rate*(double(CV(cgStep,hi))-double(CV(cgStep,lo))),slack=delta-.1*d,loNext=Y(lo)+rate*double(CV(cgStep,lo)),hiNext=Y(hi)+rate*double(CV(cgStep,hi));if(!(hiNext-loNext-.1*d>0))change=INFINITY;else change+=-e.w*std::log1p(ds/slack)+.5*e.fidelity*ds*(2*(delta-e.wanted)+ds);});}work--;}
    if(scan==n){if(change<=1e-4*rate*directional){state=38;scan=0;}else if(++backtracks<55){rate*=.5;scan=0;change=0;}else{failure=-4;return failure;}}}
   else if(state==38){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))Y(r)+=rate*double(CV(cgStep,r));work--;}if(scan==n){sweeps++;beginCert();}}
   else if(state==2){work=std::min(work,128U);selectBlock();if(b){solveBlock();if(failure==-5&&useMixed){failure=0;warmupTooWide=true;beginCert();break;}if(failure)return failure;work--;}if(scan==n){coarsePass=0;beginCoarse();}}
   else if(state==3){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),diag=.1*count(r)/n*(1/(v*v)+1/((1-v)*(1-v)));coarseH00+=diag;coarseWeighted+=diag*v;}work--;}if(scan==n){center=coarseWeighted/coarseH00;g0=g1=h01=h11=0;state=4;scan=0;}}
   else if(state==4){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),u=v-center,a=.1*count(r)/n,g=a*(-1/v+1/(1-v)),diag=a*(1/(v*v)+1/((1-v)*(1-v)));g0+=g;g1+=g*u;h01+=diag*u;h11+=diag*u*u;row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){Edge e=coefficients(lo,hi,d,m);double delta=Y(hi)-Y(lo),slack=delta-.1*d;g1+=(-e.w/slack+e.fidelity*(delta-e.wanted))*delta;h11+=(e.w/(slack*slack)+e.fidelity)*delta*delta;});}work--;}
    if(scan==n){double determinant=coarseH00*h11-h01*h01;ca=determinant>0?(-h11*g0+h01*g1)/determinant:-g0/coarseH00;cb=determinant>0?(h01*g0-coarseH00*g1)/determinant:0;coarseDirectional=g0*ca+g1*cb;if(!(coarseDirectional<0)){sweeps++;beginCert();}else{rate=1;state=5;scan=0;}}}
   else if(state==5){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),s=ca+cb*(v-center);if(s<0)rate=std::min(rate,-.99*v/s);if(s>0)rate=std::min(rate,.99*(1-v)/s);if(cb<0)row(r,true,[&](uint32_t lo,uint32_t hi,double d,double){double delta=Y(hi)-Y(lo);rate=std::min(rate,-.99*(delta-.1*d)/(cb*delta));});}work--;}if(scan==n){state=6;scan=0;change=0;backtracks=0;}}
   else if(state==6){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r)){double v=Y(r),dv=rate*(ca+cb*(v-center)),nv=v+dv;if(!(nv>0&&nv<1))change=INFINITY;else change-=.1*count(r)/n*(std::log1p(dv/v)+std::log1p(-dv/(1-v)));if(cb!=0)row(r,true,[&](uint32_t lo,uint32_t hi,double d,double m){Edge e=coefficients(lo,hi,d,m);double delta=Y(hi)-Y(lo),ds=rate*cb*delta,slack=delta-.1*d,loNext=Y(lo)+rate*(ca+cb*(Y(lo)-center)),hiNext=Y(hi)+rate*(ca+cb*(Y(hi)-center));if(!(hiNext-loNext-.1*d>0))change=INFINITY;else change+=-e.w*std::log1p(ds/slack)+.5*e.fidelity*ds*(2*(delta-e.wanted)+ds);});}work--;}
    if(scan==n){if(change<=1e-4*rate*coarseDirectional){state=7;scan=0;}else if(++backtracks<55){rate*=.5;scan=0;change=0;}else{sweeps++;beginCert();}}}
   else if(state==7){while(scan<n&&work){uint32_t r=scan++;if(isRoot(r))Y(r)+=rate*(ca+cb*(Y(r)-center));work--;}if(scan==n){coarseAccepted++;if(++coarsePass<2)beginCoarse();else{sweeps++;beginCert();}}}
  }return state==20?1:0;
 }
};
}
extern "C" {
uintptr_t tm_create(uint32_t width,uint32_t height,uint32_t heapCap,uint32_t rowCapacity){uint64_t n=uint64_t(width)*height;if(!width||!height||n>=0x80000000ULL||29*n+48*MiB>heapCap||rowCapacity<8||rowCapacity>65536||(rowCapacity&(rowCapacity-1)))return 0;
 auto*p=new(std::nothrow)Target;if(!p)return 0;p->width=width;p->height=height;p->n=uint32_t(n);p->heapCap=heapCap;p->capacity=rowCapacity;p->H=2*rowCapacity;p->edgeCapacity=rowCapacity;p->arenaBytes=((29*n+16*MiB+65535)/65536)*65536;
 if(!p->alloc(p->arena,p->arenaBytes)||!p->place(p->level,n)){delete p;return 0;}p->arenaCursor=(p->arenaCursor+3)&~uint64_t(3);p->arenaRootOffset=p->arenaCursor;
 if(!p->place(p->root,n)||!p->alloc(p->seedBand,65536)||!p->alloc(p->keys,p->H)||!p->alloc(p->axial,p->H)||!p->alloc(p->diagonal,p->H)||!p->alloc(p->slots,p->capacity)||!p->alloc(p->edges,p->edgeCapacity)||!p->alloc(p->hist,65536)||!p->alloc(p->refine,131072)||!p->alloc(p->order,65536)){delete p;return 0;}
 std::fill(p->keys,p->keys+p->H,END);std::fill(p->axial,p->axial+p->H,0);std::fill(p->diagonal,p->diagonal+p->H,0);std::fill(p->hist,p->hist+65536,0);std::fill(p->refine,p->refine+131072,0);return reinterpret_cast<uintptr_t>(p);}

void tm_destroy(Target*p){delete p;}
int tm_prepare(Target*p,uint32_t work){return p->prepare(std::max(1U,work));}
int tm_begin(Target*p,double micro,double maxError,double tolerance,uint32_t maxSweeps,uint32_t blockSize,uint32_t innerSteps,uint32_t mixed,uint32_t sgs,uint32_t vectors){return p->begin(micro,maxError,tolerance,maxSweeps,blockSize,innerSteps,mixed!=0,sgs!=0,vectors);}
void tm_seed(Target*p,uint32_t present){p->seedProvided=present!=0;}
int tm_seed_band(Target*p,uint32_t top,uint32_t length){if(top>p->n||length>p->n-top||length>65536)return -2;for(uint32_t j=0;j<length;j++){uint32_t pixel=top+j;if(p->isRoot(pixel))p->CV(p->cgStep,pixel)=p->seedBand[j];}return 0;}
int tm_solve(Target*p,uint32_t work){return p->solve(std::max(1U,work));}
int tm_pack_begin(Target*p){
 if(!p->converged||p->projectActive||!p->cgStep||!p->cgResidual)return -1;
 if(!p->packHeads&&!p->alloc(p->packHeads,65536))return -1;
 std::fill(p->packHeads,p->packHeads+65536,END);p->packAt=0;p->packPhase=1;p->packError=0;p->packMargin=INFINITY;return 0;
}
int tm_pack_step(Target*p,uint32_t work){
 constexpr double slope=.1+0x1p-32,scale=2147483648.;
 auto*codes=reinterpret_cast<uint32_t*>(p->cgResidual);auto*next=reinterpret_cast<uint32_t*>(p->cgStep);
 auto decode=[&](uint32_t r){return double(codes[p->cid(r)])/scale-slope+slope*p->value(r);};
 while(work&&p->packPhase!=5){
  if(p->packPhase==1){while(p->packAt<p->n&&work){uint32_t r=p->packAt++;if(p->isRoot(r)){double code=std::round((p->Y(r)-slope*p->value(r)+slope)*scale);if(!(code>=0&&code<=4294967295.))return -2;codes[p->cid(r)]=uint32_t(code);next[p->cid(r)]=p->packHeads[p->level[r]];p->packHeads[p->level[r]]=r;}work--;}if(p->packAt==p->n){p->packPhase=2;p->packLevel=0;p->packCurrent=p->packHeads[0];}}
  else if(p->packPhase==2||p->packPhase==3){
   const bool forward=p->packPhase==2;
   while(work&&p->packLevel>=0&&p->packLevel<65536){
    if(p->packCurrent==END){p->packLevel+=forward?1:-1;if(p->packLevel>=0&&p->packLevel<65536)p->packCurrent=p->packHeads[p->packLevel];continue;}
    uint32_t r=p->packCurrent;p->packCurrent=next[p->cid(r)];uint32_t code=codes[p->cid(r)];
    if(forward){code=std::max(code,uint32_t(std::ceil((slope-slope*p->value(r))*scale)+1));if(!p->constant&&!p->row(r,false,[&](uint32_t lo,uint32_t hi,double,double){if(hi==r)code=std::max(code,codes[p->cid(lo)]);}))return -3;}
    else{code=std::min(code,uint32_t(std::floor((1+slope-slope*p->value(r))*scale)-1));if(!p->constant&&!p->row(r,true,[&](uint32_t,uint32_t hi,double,double){code=std::min(code,codes[p->cid(hi)]);}))return -3;}
    codes[p->cid(r)]=code;work--;
   }
   if(p->packLevel>=65536){p->packPhase=3;p->packLevel=65535;p->packCurrent=p->packHeads[65535];}
   else if(p->packLevel<0){p->packPhase=4;p->packAt=0;}
  }
  else if(p->packPhase==4){while(p->packAt<p->n&&work){uint32_t r=p->packAt++;if(p->isRoot(r)){double y=decode(r);if(!(y>=0&&y<=1))return -2;p->packError=std::max(p->packError,std::abs(y-p->Y(r)));if(!p->constant&&!p->row(r,true,[&](uint32_t lo,uint32_t hi,double d,double){p->packMargin=std::min(p->packMargin,decode(hi)-decode(lo)-.1*d);}))return -3;}work--;}if(p->packAt==p->n){if(p->packMargin<0)return -2;p->packPhase=5;}}
  else return -1;
 }
 return p->packPhase==5?1:0;
}
double tm_pack_info(Target*p,uint32_t field){return field?p->packMargin:p->packError;}
const void*tm_array(Target*p,int field){switch(field){case 0:return p->level;case 1:return p->graph.denseRoots;case 2:return p->y;case 3:return p->graph.nonroots;case 4:return p->graph.nonrootPrefix;case 5:return p->graph.parents;case 6:return p->seedBand;case 7:return p->graph.special;case 8:return p->graph.specialPrefix;case 9:return p->graph.counts;case 10:return p->graph.heads;case 11:return p->graph.nextSparse;case 12:return p->arena;case 13:return p->curveCodes;case 14:return p->cgStep;case 15:return p->cgResidual;case 16:return p->cgDirection;case 17:return p->visited;case 18:return p->cgResidual;case 19:return p->projectTrial;case 20:return p->projectTb;default:return nullptr;}}
double tm_value(Target*p,uint32_t pixel){return pixel<p->n?p->Y(p->constant?pixel:p->owner(pixel)):NAN;}
const double*tm_info(Target*p){double*out=p->info;out[0]=p->phase;out[1]=p->C;out[2]=double(p->E);out[3]=p->minimum;out[4]=p->maximum;out[5]=p->median;out[6]=p->weak;out[7]=p->normalizer;out[8]=p->state;out[9]=p->sweeps;out[10]=p->maxBound;out[11]=p->rmsBound;out[12]=p->roundoff;out[13]=p->converged;out[14]=double(p->localSteps);out[15]=double(p->blockSolves);out[16]=double(p->coarseAccepted);out[17]=p->exactQuantiles;out[18]=p->quantileError;out[19]=double(p->visits);out[20]=double(p->replays);out[21]=p->singleton;out[22]=p->scan;out[23]=p->n;out[24]=p->certLinear;out[25]=p->certNonlinear;out[26]=p->cgTotal;out[27]=p->totalRestarts;out[28]=p->trueChecks;out[29]=p->useMixed;out[30]=p->knotIterations;out[31]=p->parentCapacity;out[32]=p->nextCapacity;out[33]=p->warmupTooWide;out[34]=p->sgs;out[35]=p->cached;out[36]=p->threeVectors;out[37]=double(p->curveBuilds);out[38]=double(p->curveClampCount);out[39]=0;out[40]=0;out[41]=p->seedProvided;out[42]=p->seedAccepted;out[43]=p->graph.constant?0:p->graph.identity?1:p->graph.compressed?3:2;out[44]=p->graph.M;out[45]=p->graph.R;out[46]=double(p->arenaBytes);out[47]=double(p->arenaUsed);out[48]=p->graph.blocks;out[49]=double(p->graph.graphBytes);out[50]=p->C;out[51]=p->paletteReady;out[52]=p->uniqueLevels;out[53]=p->certSingleEdgePass;out[54]=double(p->certEdgeEvaluations);out[55]=double(p->certPasses);out[56]=p->pairCacheReady;out[57]=p->pairBuilds;out[58]=double(p->matchedPairVertices);out[59]=p->replayedQuantiles;out[60]=p->quantileRunCount;out[61]=double(p->replayedAdditions);out[62]=p->replayTotal;out[63]=p->uniformRuns;out[64]=p->exactTapeUsed;out[65]=double(p->exactTapeBytes);out[66]=double(p->exactScratchBytes);out[67]=double(p->exactTemporaryBytes);out[68]=double(p->exactTape?p->exactTape->additions:p->exactAdditions);out[69]=double(p->exactTerms);out[70]=p->exactTape?p->exactTape->phase:0;out[71]=p->exactTape?p->exactTape->currentGap:0;out[72]=p->exactHistoricalTotal;out[73]=sizeof(sherloq7c::ExactQuantileTape);out[74]=p->certRingPass;out[75]=p->certRingLength;out[76]=16ULL*p->certRingLength;return out;}
int tm_project_prepare(Target*p){
 if(!p->converged||p->projectActive||p->projectStaging||p->micro!=0)return -1;
 p->projectTb=reinterpret_cast<uint32_t*>(p->curveCodes);p->projectCopied=0;p->projectStaging=true;return 0;
}
int tm_project_band(Target*p,uint32_t first,uint32_t length){
 if(!p->projectStaging||first!=p->projectCopied||length>65536||first>p->n||length>p->n-first)return -1;
 auto*band=reinterpret_cast<uint32_t*>(p->seedBand);constexpr double slope=.1+0x1p-32;
 const double lo=double(p->minimum)/65535.,span=double(p->maximum)/65535.-lo;
 for(uint32_t j=0;j<length;j++){const uint32_t i=first+j,code=band[j];p->projectTb[i]=code;const double level=p->value(i),baseline=span?(level-lo)/span:level;
  const double trial=baseline+(double(code)/2147483648.-slope+slope*level)-p->Y(p->owner(i));if(!(trial>=-1&&trial<=2))return -2;band[j]=uint32_t(std::round((trial+1)*1073741824.));}
 p->projectCopied+=length;return 0;
}
int tm_project_relayout(Target*p){
 if(!p->projectStaging||p->projectCopied!=p->n||p->projectActive)return -1;
 const uint64_t base=(2ULL*p->n+7)&~7ULL;
 auto*tb=reinterpret_cast<uint32_t*>(p->arena+base);std::memmove(tb,p->projectTb,4ULL*p->n);p->projectTb=tb;
 p->projectTrial=reinterpret_cast<uint32_t*>(p->arena+((base+6ULL*p->n+7)&~7ULL)+16ULL*p->n);p->projectTrialCopied=0;
 // No former graph/vector pointer is used after this point. Pages stay funded.
 p->projectActive=true;return 0;
}
int tm_project_trial_band(Target*p,uint32_t first,uint32_t length){
 if(!p->projectActive||first!=p->projectTrialCopied||length>65536||first>p->n||length>p->n-first)return -1;
 std::memcpy(p->projectTrial+first,p->seedBand,4ULL*length);p->projectTrialCopied+=length;return 0;
}
int tm_project_begin(Target*p,double revelation,double tolerance){
 if(!p->projectActive||p->projectTrialCopied!=p->n||!(revelation>=0&&revelation<1))return -1;
 const uint64_t base=(2ULL*p->n+7)&~7ULL;auto*parent=p->arena+base+4ULL*p->n;auto*children=parent+p->n;
 const uint64_t lambdaOffset=(base+6ULL*p->n+7)&~7ULL;auto*lambda=reinterpret_cast<double*>(p->arena+lambdaOffset);auto*mass=reinterpret_cast<int32_t*>(p->arena+lambdaOffset+8ULL*p->n);auto*scratch=reinterpret_cast<uint32_t*>(p->arena+lambdaOffset+12ULL*p->n);
 if(lambdaOffset+20ULL*p->n>p->arenaBytes)return -1;
 p->projectR=revelation;p->projectCheckAt=0;p->projectMargin=INFINITY;
 sherloq7c::PixelForestArena arena{p->level,p->projectTrial,parent,children,lambda,mass,scratch};sherloq7c::PixelForestOptions options;options.certificateTolerance=tolerance;options.maxPivots=uint32_t(std::max<uint64_t>(1000000,std::min<uint64_t>(UINT32_MAX,16ULL*p->n)));
 return p->forest.begin(p->width,p->height,arena,options);
}
int tm_project_step(Target*p,uint32_t work){return p->projectActive?p->forest.step(work):-1;}
double tm_project_value(Target*p,uint32_t i){if(!p->projectActive||i>=p->n)return NAN;constexpr double slope=.1+0x1p-32;const double tb=double(p->projectTb[i])/2147483648.-slope+slope*p->value(i);return (1-p->projectR)*p->forest.valueAt(i)+p->projectR*tb;}
int tm_project_check(Target*p,uint32_t work){
 if(!p->projectActive)return -1;while(p->projectCheckAt<p->n&&work--){const uint32_t i=p->projectCheckAt++;const double z=tm_project_value(p,i);if(!(z>=0&&z<=1))return -2;
  for(uint32_t k=0;k<4;k++){uint32_t j;if(!p->neighbor(i,k==0?0:k==1?2:k==2?4:6,j))continue;double q=tm_project_value(p,j),d=p->value(j)-p->value(i);if(d==0){if(q!=z)return -2;}else p->projectMargin=std::min(p->projectMargin,d>0?q-z-.1*d:z-q+.1*d);}}
 if(p->projectCheckAt==p->n)return p->projectMargin<0?-2:1;return 0;
}
const double*tm_project_info(Target*p){const auto&i=p->forest.info();double*v=p->projectInfo;v[0]=i.components;v[1]=i.largestComponent;v[2]=i.equalityEdges;v[3]=i.pivots;v[4]=i.cuts;v[5]=i.passes;v[6]=i.certificateMax;v[7]=i.certificateRMS;v[8]=i.minimumMargin;v[9]=i.gap;v[10]=i.acceptedByCertificate;v[11]=p->forest.currentPhase();v[12]=p->forest.failureReason();v[13]=p->projectMargin;v[14]=i.totalTreeVisits;v[15]=i.dependentSteps;return v;}

}

#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
// Allocation-free pixel equality forest. The caller owns every array and this
// control object. step(work) suspends BFS, walks, pivots and rerooting paths.
// Work is consumed per pixel, physical contact, DFS event or reversed edge.
// Phase groups: 1-5 initialization; 6-8 constraint scans; 9-13 repair and
// original-component certificate; 20-29 active-set pivots; 30-32 reroot paths.
// Inputs: level/65535 and trialCode/2^30-1. Output: original scalar z in [0,1].
// begin() checks disjoint/aligned ranges; the embedding must check that these
// ranges lie inside its backing memory. Their backing and offsets must remain
// live while the solver or output is used. The class never allocates or frees them.
namespace sherloq7c {
struct PixelForestArena {
 const uint16_t*levels=nullptr; const uint32_t*trial=nullptr;
 uint8_t*parent=nullptr;uint8_t*children=nullptr;double*lambda=nullptr;
 int32_t*mass=nullptr;uint32_t*scratch=nullptr;
};
struct PixelForestOptions {
 double certificateTolerance=std::numeric_limits<double>::infinity(),feasibilityTolerance=2e-13;
 uint32_t maxPivots=1000000,maxPasses=10000;bool diagnosticOnly=false;
};
struct PixelForestInfo {
 uint32_t pixels=0,components=0,largestComponent=0,equalityEdges=0,cuts=0,insertions=0,dependentSteps=0,maxActive=0;
 uint64_t totalTreeVisits=0,pivots=0,passes=0;
 double primal=0,gapRaw=0,roundingAllowance=0,gap=0,certificateMax=0,certificateRMS=0,minimumMargin=INFINITY,minimumDual=INFINITY,maxStationarity=0,repairFraction=0,minimumEqualityDual=INFINITY,maximumEqualityDual=-INFINITY;
 bool acceptedByCertificate=false;
};
class PixelForest {
 static constexpr uint32_t NONE=0xffffffffU;static constexpr uint8_t FREE=8,LOWER=9,UPPER=10,ANCHOR=11,UNVISITED=255;
 enum WalkOperation {InitMass,Refresh,Aggregate,FindBlocker,UpdateDual,MergeRoots,Certificate};
 PixelForestArena a{};PixelForestOptions o{};PixelForestInfo out{};
 uint32_t w=0,h=0,n=0,at=0,start=0,bfsHead=0,bfsTail=0,active=0,certifiedComponents=0;uint16_t minimum=65535,maximum=0;
 int phase=0,status=0,reason=0,returnPhase=0;bool changed=false;
 uint32_t edgeKind=0,edgeX=0,edgeY=0;
 uint32_t walkAt=NONE,walkPrevious=NONE,walkRoot=NONE;bool walking=false,walkEntering=true,walkEqual=false;WalkOperation walkOperation=InitMass;
 uint32_t l=0,r=0,lr=0,hr=0,kind=0,blocker=NONE,treeIndex=0;double constraint=0,newLambda=0,lp=0,hp=0,stepLength=0,currentSpeed=0;
 uint32_t refreshedRoot=0,refreshedMass=0,rerootNew=0,rerootOld=0,rerootChild=0,rerootParent=0,rerootRebuild=0,rerootMass=0,mergeChild=0,mergeParent=0,mergeParentRoot=0,mergeChildMass=0,mergeParentMass=0;
 int rerootReturn=0;double rerootDual=0,rerootValue=0;
 double componentQi=0,componentTrial=0,componentValue=0,componentResidual=0;uint16_t componentLevel=0;
 uint32_t certRoot=0,certMass=0;double certZ=0,certTrial=0,certForce=0,roundingScale=0,minCount=INFINITY;
 static int dx(uint32_t d){return d==0||d==3||d==5?-1:d==2||d==4||d==7?1:0;}
 static int dy(uint32_t d){return d<3?-1:d<5?0:1;}
 double level(uint32_t i)const{return double(a.levels[i])/65535.;}
 double trial(uint32_t i)const{return double(a.trial[i])/1073741824.-1.;}
 double q(uint32_t i)const{return trial(i)-.1*level(i);}
 bool anchor(uint32_t i)const{return a.levels[i]==minimum||a.levels[i]==maximum;}
 double baseline(uint32_t i)const{const double v=level(i),lo=double(minimum)/65535.,hi=double(maximum)/65535.;return minimum==maximum?v:(v-lo)/(hi-lo);}
 uint32_t neighbour(uint32_t i,uint32_t d)const{return uint32_t(int64_t(i)+int64_t(dy(d))*w+dx(d));}
 uint32_t direction(uint32_t from,uint32_t to)const{const int x=int(to%w)-int(from%w),y=int(to/w)-int(from/w);for(uint32_t d=0;d<8;d++)if(dx(d)==x&&dy(d)==y)return d;return 8;}
 uint32_t parentNode(uint32_t i)const{return a.parent[i]<8?neighbour(i,a.parent[i]):n;}
 uint32_t root(uint32_t i)const{return a.mass[i]<0?i:uint32_t(a.mass[i]);}
 bool equality(uint32_t i)const{uint32_t p=parentNode(i);return p<n&&a.levels[i]==a.levels[p];}
 int sign(uint32_t i,uint32_t j)const{return a.levels[i]<a.levels[j]||(a.levels[i]==a.levels[j]&&i<j)?1:-1;}
 void setParent(uint32_t i,uint32_t p){a.parent[i]=uint8_t(direction(i,p));}
 void addChild(uint32_t i,uint32_t child){a.children[i]|=uint8_t(1U<<direction(i,child));}
 void unlinkChild(uint32_t i,uint32_t child){a.children[i]&=uint8_t(~(1U<<direction(i,child)));}
 uint32_t childAfter(uint32_t i,uint32_t first,bool equalOnly)const{uint8_t bits=a.children[i];for(uint32_t d=first;d<8;d++)if(bits&(1U<<d)){uint32_t c=neighbour(i,d);if(!equalOnly||a.levels[c]==a.levels[i])return c;}return NONE;}
 double rootValue(uint32_t i)const{uint8_t m=a.parent[i];return m==FREE?a.lambda[i]:m==LOWER?-.1*level(i):m==UPPER?1-.1*level(i):baseline(i)-.1*level(i);}
 double value(uint32_t i)const{return i==n?0:rootValue(root(i));}
 double raw(uint32_t i)const{return anchor(i)?baseline(i):std::max(0.,std::min(1.,value(i)+.1*level(i)));}
 double z(uint32_t i)const{return (1-out.repairFraction)*raw(i)+out.repairFraction*baseline(i);}
 int fail(int code){reason=code;status=-3;return status;}
 void beginWalk(uint32_t rr,WalkOperation op,bool equalOnly=false){walkAt=walkRoot=rr;walkPrevious=NONE;walkEntering=walking=true;walkEqual=equalOnly;walkOperation=op;}
 double delta(uint32_t i,double speed)const{uint32_t s=a.scratch[i],mask=s&3,p=parentNode(i);double rhs=-speed*(s>>2)-((mask&1)?1:0)+((mask&2)?1:0);int incidence=p<n?sign(i,p):a.parent[i]==UPPER?1:-1;return incidence*rhs;}
 void enterWalk(uint32_t i){
  switch(walkOperation){
   case InitMass:a.scratch[i]=1;break;
   case Refresh:a.mass[i]=int32_t(refreshedRoot);break;
   case Aggregate:a.scratch[i]=4+(i==l?1:0)+(i==r?2:0);out.totalTreeVisits++;break;
   case FindBlocker:{uint8_t m=a.parent[i];if(m==FREE||m==ANCHOR||equality(i))break;double d=delta(i,currentSpeed);if(d<0){double t=std::max(0.,a.lambda[i]/-d);if(t<stepLength){stepLength=t;blocker=i;}}break;}
   case UpdateDual:{uint8_t m=a.parent[i];if(m==FREE||m==ANCHOR)break;bool eq=equality(i);double v=a.lambda[i]+stepLength*delta(i,currentSpeed);if(!std::isfinite(v)||(!eq&&v< -1e-11)){fail(1);break;}a.lambda[i]=eq?v:std::max(0.,v);break;}
   case MergeRoots:a.mass[i]=int32_t(mergeParentRoot);break;
   case Certificate:{
    if(z(i)!=certZ||trial(i)!=certTrial){fail(2);break;}certMass++;uint32_t p=parentNode(i);uint8_t m=a.parent[i];double dual=a.lambda[i];
    if(p<n&&!equality(i)){certForce+=sign(i,p)*dual;out.minimumDual=std::min(out.minimumDual,dual);uint32_t lo=a.levels[i]<a.levels[p]?i:p,hi=lo==i?p:i;double floor=.1*(level(hi)-level(lo)),slack=z(hi)-z(lo)-floor;out.gapRaw+=dual*std::max(0.,slack);roundingScale+=dual*(std::abs(z(lo))+std::abs(z(hi))+std::abs(floor));}
    else if(p==n&&(m==UPPER||m==LOWER)){certForce+=(m==UPPER?1:-1)*dual;out.minimumDual=std::min(out.minimumDual,dual);out.gapRaw+=dual*(m==UPPER?1-certZ:certZ);roundingScale+=dual*(1+std::abs(certZ));}
    for(uint32_t child=childAfter(i,0,false);child!=NONE;child=childAfter(i,direction(i,child)+1,false))if(!equality(child))certForce+=sign(i,child)*a.lambda[child];break;
   }
  }
 }
 void leaveWalk(uint32_t i){uint32_t p=parentNode(i);if(p>=n)return;if(walkOperation==InitMass){uint32_t mass=a.scratch[i];a.scratch[p]+=mass;a.lambda[i]=-sign(i,p)*componentResidual*mass;}else if(walkOperation==Aggregate){uint32_t b=a.scratch[p],c=a.scratch[i];a.scratch[p]=4*((b>>2)+(c>>2))+((b|c)&3);}}
 bool walk(uint32_t&work){while(walking&&work&&status==0){work--;if(walkEntering)enterWalk(walkAt);if(status)return false;uint32_t child=childAfter(walkAt,walkEntering?0:direction(walkAt,walkPrevious)+1,walkEqual);if(child!=NONE){walkAt=child;walkEntering=true;continue;}leaveWalk(walkAt);if(walkAt==walkRoot){walking=false;break;}walkPrevious=walkAt;walkAt=parentNode(walkAt);walkEntering=false;}return !walking;}
 void beginRefresh(uint32_t rr,uint32_t mass){refreshedRoot=rr;refreshedMass=mass;beginWalk(rr,Refresh);}
 bool refresh(uint32_t&work){if(!walk(work))return false;a.mass[refreshedRoot]=-int32_t(refreshedMass);return true;}
 void edgeReset(){edgeKind=edgeX=edgeY=0;}
 bool nextEdge(uint32_t&lo,uint32_t&hi,uint32_t&work){while(edgeKind<4&&work){int xdir=edgeKind==1?0:edgeKind==3?-1:1;uint32_t ydir=edgeKind==0?0:1;uint32_t xmin=xdir<0?1:0,xend=w-(xdir>0?1:0),yend=h-ydir;if(xend<=xmin||!yend){edgeKind++;edgeX=edgeY=0;continue;}if(edgeX<xmin)edgeX=xmin;if(edgeY>=yend){edgeKind++;edgeX=edgeY=0;continue;}if(edgeX>=xend){edgeX=xmin;edgeY++;continue;}uint32_t aa=edgeY*w+edgeX++,bb=uint32_t(int64_t(aa)+uint64_t(ydir)*w+xdir);work--;if(a.levels[aa]==a.levels[bb])continue;lo=a.levels[aa]<a.levels[bb]?aa:bb;hi=lo==aa?bb:aa;return true;}return false;}
 void startResolve(uint32_t lo,uint32_t hi,double b,uint32_t type,int resume){l=lo;r=hi;constraint=b;kind=type;newLambda=0;returnPhase=resume;phase=20;}
 bool nextTree(WalkOperation op){while(treeIndex<2){uint32_t t=treeIndex++;uint32_t rr=t?hr:lr;if(rr>=n||(t&&hr==lr))continue;currentSpeed=t?hp:lp;beginWalk(rr,op);return true;}return false;}
 void startReroot(uint32_t i,int resume){rerootNew=i;rerootOld=root(i);rerootReturn=resume;if(a.parent[rerootOld]!=FREE){fail(3);return;}if(rerootOld==i){phase=resume;return;}rerootValue=rootValue(rerootOld);rerootMass=uint32_t(-a.mass[rerootOld]);rerootChild=i;rerootParent=parentNode(i);rerootDual=a.lambda[i];a.parent[i]=FREE;phase=30;}
public:
 int begin(uint32_t width,uint32_t height,const PixelForestArena&arena,const PixelForestOptions&options={}){
  *this=PixelForest{};w=width;h=height;const uint64_t count=uint64_t(w)*h;if(!w||!h||count>=(uint64_t(1)<<30)||!count){status=-1;return status;}n=uint32_t(count);a=arena;o=options;out.pixels=n;
  if(!a.levels||!a.trial||!a.parent||!a.children||!a.lambda||!a.mass||!a.scratch||!(o.certificateTolerance>=0)||!(o.feasibilityTolerance>=0)||!o.maxPasses||!o.maxPivots){status=-1;return status;}
  const uintptr_t pointers[]={reinterpret_cast<uintptr_t>(a.levels),reinterpret_cast<uintptr_t>(a.trial),reinterpret_cast<uintptr_t>(a.parent),reinterpret_cast<uintptr_t>(a.children),reinterpret_cast<uintptr_t>(a.lambda),reinterpret_cast<uintptr_t>(a.mass),reinterpret_cast<uintptr_t>(a.scratch)};const uint32_t sizes[]={2,4,1,1,8,4,4};
  for(uint32_t i=0;i<7;i++){if(pointers[i]%sizes[i]){status=-1;return status;}for(uint32_t j=0;j<i;j++)if(uint64_t(pointers[i])<uint64_t(pointers[j])+uint64_t(n)*sizes[j]&&uint64_t(pointers[j])<uint64_t(pointers[i])+uint64_t(n)*sizes[i]){status=-1;return status;}}
  phase=1;return 0;
 }
 int step(uint32_t work){
  while(work&&status==0){
   if(phase==1){while(at<n&&work){minimum=std::min(minimum,a.levels[at]);maximum=std::max(maximum,a.levels[at]);a.parent[at]=UNVISITED;a.children[at]=0;at++;work--;}if(at==n){phase=2;at=0;}}
   else if(phase==2){while(at<n&&a.parent[at]!=UNVISITED&&work){at++;work--;}if(at==n){phase=5;at=0;continue;}if(!work)continue;start=at;out.components++;bfsHead=0;bfsTail=1;componentLevel=a.levels[start];componentTrial=trial(start);componentQi=q(start);a.scratch[0]=start;a.parent[start]=FREE;a.mass[start]=int32_t(start);phase=3;}
   else if(phase==3){while(bfsHead<bfsTail&&work){uint32_t i=a.scratch[bfsHead++];int x=int(i%w),y=int(i/w);for(uint32_t d=0;d<8;d++){int xx=x+dx(d),yy=y+dy(d);if(xx<0||xx>=int(w)||yy<0||yy>=int(h))continue;uint32_t j=uint32_t(yy)*w+uint32_t(xx);if(a.levels[j]!=componentLevel||a.parent[j]!=UNVISITED)continue;if(trial(j)!=componentTrial){status=-1;reason=4;return status;}setParent(j,i);addChild(i,j);a.mass[j]=int32_t(start);a.scratch[bfsTail++]=j;}work--;}
    if(bfsHead==bfsTail){out.largestComponent=std::max(out.largestComponent,bfsTail);a.mass[start]=-int32_t(bfsTail);double lo=-.1*level(start),hi=1-.1*level(start);uint8_t mode=FREE;componentValue=componentQi;if(anchor(start)){mode=ANCHOR;componentValue=baseline(start)-.1*level(start);}else if(componentQi<lo){mode=LOWER;componentValue=lo;}else if(componentQi>hi){mode=UPPER;componentValue=hi;}a.parent[start]=mode;componentResidual=componentValue-componentQi;beginWalk(start,InitMass);phase=4;}}
   else if(phase==4){if(walk(work)){uint8_t mode=a.parent[start];double lo=-.1*level(start),hi=1-.1*level(start);a.lambda[start]=mode==FREE?componentValue:mode==UPPER?bfsTail*(componentQi-hi):mode==LOWER?bfsTail*(lo-componentQi):0;at=start+1;phase=2;}}
   else if(phase==5){while(at<n&&work){uint8_t m=a.parent[at];if(equality(at)||m==LOWER||m==UPPER||m==ANCHOR)active++;at++;work--;}if(at==n){out.maxActive=active;phase=6;}}
   else if(phase==6){out.passes++;changed=false;edgeReset();phase=7;}
   else if(phase==7){uint32_t lo,hi;if(nextEdge(lo,hi,work)){if(value(lo)-value(hi)>o.feasibilityTolerance){changed=true;startResolve(lo,hi,0,0,7);}}else if(edgeKind==4){phase=8;at=0;}}
   else if(phase==8){while(at<n&&work&&phase==8){uint32_t i=at++;work--;if(anchor(i))continue;double v=value(i),lo=-.1*level(i),hi=1-.1*level(i);if(v>hi+o.feasibilityTolerance){changed=true;startResolve(i,n,hi,1,8);}else if(v<lo-o.feasibilityTolerance){changed=true;startResolve(n,i,-lo,2,8);}}
    if(at==n&&phase==8){if(changed){if(out.passes>o.maxPasses){status=-2;reason=5;}else phase=6;}else{phase=9;edgeReset();}}}
   else if(phase==9){uint32_t lo,hi;if(nextEdge(lo,hi,work)){double floor=.1*(level(hi)-level(lo)),slack=raw(hi)-raw(lo)-floor;if(slack<0){double baseSlack=baseline(hi)-baseline(lo)-floor;out.repairFraction=std::max(out.repairFraction,-slack/(baseSlack-slack));}}else if(edgeKind==4){if(out.repairFraction>0)out.repairFraction=std::min(1.,out.repairFraction*1.0001+8*std::numeric_limits<double>::epsilon());phase=10;at=0;}}
   else if(phase==10){while(at<n&&work){if(equality(at)){out.equalityEdges++;out.minimumEqualityDual=std::min(out.minimumEqualityDual,a.lambda[at]);out.maximumEqualityDual=std::max(out.maximumEqualityDual,a.lambda[at]);}at++;work--;}if(at==n){phase=11;at=0;}}
   else if(phase==11){while(at<n&&equality(at)&&work){at++;work--;}if(at==n){if(certifiedComponents!=out.components||out.equalityEdges!=n-out.components)return fail(6);phase=13;edgeReset();continue;}if(!work)continue;certRoot=at;certZ=z(at);certTrial=trial(at);certMass=0;certForce=0;certifiedComponents++;beginWalk(at,Certificate,true);phase=12;}
   else if(phase==12){if(walk(work)){if(!anchor(certRoot)){double station=certMass*(certZ-certTrial)+certForce;out.gapRaw+=.5*station*station/certMass;minCount=std::min(minCount,double(certMass));out.maxStationarity=std::max(out.maxStationarity,std::abs(station));double d=certZ-certTrial;out.primal+=.5*certMass*d*d;}at=certRoot+1;phase=11;}}
   else if(phase==13){uint32_t lo,hi;if(nextEdge(lo,hi,work))out.minimumMargin=std::min(out.minimumMargin,z(hi)-z(lo)-.1*(level(hi)-level(lo)));else if(edgeKind==4){if(out.minimumMargin< -2e-15||out.minimumDual<0)return fail(7);out.roundingAllowance=64*std::numeric_limits<double>::epsilon()*(std::numeric_limits<double>::denorm_min()+out.gapRaw+roundingScale);out.gap=out.gapRaw+out.roundingAllowance;out.certificateMax=minCount==INFINITY?0:std::sqrt(2*out.gap/minCount);out.certificateRMS=std::sqrt(2*out.gap/n);if(!std::isfinite(out.gap)||!std::isfinite(out.primal)||!std::isfinite(out.certificateMax))return fail(8);out.acceptedByCertificate=out.certificateMax<=o.certificateTolerance;status=out.acceptedByCertificate||o.diagnosticOnly?1:-4;}}
   else if(phase==20){if(++out.pivots>o.maxPivots){status=-2;reason=9;continue;}lr=l<n?root(l):n;hr=r<n?root(r):n;bool same=lr==hr;lp=lr<n&&a.parent[lr]==FREE&&!same?-1./(-a.mass[lr]):0;hp=hr<n&&a.parent[hr]==FREE&&!same?1./(-a.mass[hr]):0;treeIndex=0;nextTree(Aggregate);phase=21;}
   else if(phase==21){if(walk(work)&&!nextTree(Aggregate)){double closing=hp-lp,violation=value(l)-value(r)-constraint;stepLength=closing>0?std::max(0.,violation/closing):INFINITY;blocker=NONE;if(!(closing>0))out.dependentSteps++;treeIndex=0;nextTree(FindBlocker);phase=22;}}
   else if(phase==22){if(walk(work)&&!nextTree(FindBlocker)){if(!std::isfinite(stepLength))return fail(10);treeIndex=0;nextTree(UpdateDual);phase=23;}}
   else if(phase==23){if(walk(work)){uint32_t rr=treeIndex==1?lr:hr;if(rr<n&&a.parent[rr]==FREE)a.lambda[rr]+=stepLength*currentSpeed;if(!nextTree(UpdateDual)){newLambda+=stepLength;phase=24;}}}
   else if(phase==24){if(blocker!=NONE){if(equality(blocker))return fail(11);uint32_t rr=root(blocker),pa=parentNode(blocker);double v=rootValue(rr);if(pa<n){uint32_t part=a.scratch[blocker]>>2;uint32_t mass=uint32_t(-a.mass[rr]);unlinkChild(pa,blocker);a.parent[blocker]=FREE;a.lambda[blocker]=v;beginRefresh(blocker,part);a.mass[rr]=-int32_t(mass-part);phase=25;}else{a.parent[blocker]=FREE;a.lambda[blocker]=v;out.cuts++;active--;phase=20;}}
    else if(kind){startReroot(l<n?l:r,26);}else{uint32_t rl=root(l),rh=root(r);if(rl==rh)return fail(12);bool low=a.parent[rl]==FREE&&(a.parent[rh]!=FREE||-a.mass[rl]<=-a.mass[rh]);mergeChild=low?l:r;mergeParent=low?r:l;mergeChildMass=uint32_t(-a.mass[root(mergeChild)]);mergeParentRoot=root(mergeParent);mergeParentMass=uint32_t(-a.mass[mergeParentRoot]);startReroot(mergeChild,27);}}
   else if(phase==25){if(refresh(work)){out.cuts++;active--;phase=20;}}
   else if(phase==26){uint32_t i=l<n?l:r;a.parent[i]=kind==1?UPPER:LOWER;a.lambda[i]=newLambda;phase=29;}
   else if(phase==27){setParent(mergeChild,mergeParent);addChild(mergeParent,mergeChild);a.lambda[mergeChild]=newLambda;beginWalk(mergeChild,MergeRoots);phase=28;}
   else if(phase==28){if(walk(work)){a.mass[mergeParentRoot]=-int32_t(mergeParentMass+mergeChildMass);phase=29;}}
   else if(phase==29){out.insertions++;active++;out.maxActive=std::max(out.maxActive,active);phase=returnPhase;}
   else if(phase==30){while(rerootParent<n&&work){uint32_t above=parentNode(rerootParent);double nextDual=a.lambda[rerootParent];unlinkChild(rerootParent,rerootChild);setParent(rerootParent,rerootChild);a.lambda[rerootParent]=rerootDual;rerootChild=rerootParent;rerootParent=above;rerootDual=nextDual;work--;}if(rerootParent==n){rerootRebuild=rerootOld;phase=31;}}
   else if(phase==31){while(rerootRebuild!=rerootNew&&work){uint32_t up=parentNode(rerootRebuild);addChild(up,rerootRebuild);rerootRebuild=up;work--;}if(rerootRebuild==rerootNew){a.lambda[rerootNew]=rerootValue;beginRefresh(rerootNew,rerootMass);phase=32;}}
   else if(phase==32){if(refresh(work))phase=rerootReturn;}
   else return fail(13);
  }
  return status;
 }
 double valueAt(uint32_t i)const{return status==1&&i<n?z(i):std::numeric_limits<double>::quiet_NaN();}
 const PixelForestInfo&info()const{return out;}int currentPhase()const{return phase;}int failureReason()const{return reason;}
};
}

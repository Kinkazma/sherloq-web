#pragma once
#include "target-memory-mass-palette.hpp"
// Optional funded representation inside the same global Newton solver.
// The pattern and Hessian use the original native quotient graph. No pixel
// threshold, alternate image engine, changed objective or relaxed certificate.
struct NativeIC0 {
 uint32_t *rows=nullptr,*columns=nullptr,*arcRows=nullptr,*arcEdges=nullptr,*componentIndex=nullptr;
 double*ownedWork=nullptr;
 double *curve=nullptr,*lower=nullptr,*diagonal=nullptr,*mass=nullptr,*nodeDiagonal=nullptr,*gradient=nullptr,*hdiag=nullptr,*prefixWork=nullptr,*tailWork=nullptr;
 uint8_t*mass8=nullptr;uint16_t*mass16=nullptr;const NativeMassPalette*massPalette=nullptr;uint32_t massWidth=8;
 uint32_t prefixCapacity=0,reductionPrefixCapacity=0,workspaceAllocationRefusals=0,lastEdge=0xffffffffU;
 double& at(uint32_t i){return i<prefixCapacity?prefixWork[i]:tailWork[i-prefixCapacity];}
 uint64_t mapBytes=0,bytes=0,entries=0,factors=0,products=0,maxPatternDegree=0;
 bool decided=false,active=false,patternReady=false,arcReady=false,mapReady=false,derivativesReady=false,compactArc=false;
 // The same exact byte plan drives optional preparation and final admission.
 // Preparation must not use useMixed: that policy is selected only in begin().
 struct MemoryPlan {uint32_t prefixCapacity;uint64_t coreBytes,mapBytes,bytes;bool compactArc,contiguousWork;};
 static MemoryPlan memoryPlan(uint32_t pixels,uint32_t components,uint64_t edges,uint32_t width,bool compact=false,bool allowMap=true,bool contiguous=false){
  const uint32_t borrowed=uint32_t(std::min<uint64_t>(components,6ULL*pixels/8)),prefix=contiguous?components:borrowed;
  const uint64_t core=(compact?24ULL+width:28ULL+width)*edges+40ULL*components+8ULL*(contiguous?components:components-prefix)+8;
  const uint64_t map=allowMap&&4ULL*pixels<=core/8?4ULL*pixels:0;
  return{prefix,core,map,core+map,compact,contiguous};
 }
 static uint64_t admissionBytes(const MemoryPlan&plan,uint32_t pixels){return plan.bytes+4ULL*pixels+64ULL*1048576;}
 // Both final admission and private JS hints share the exact same credit.
 // These live independent banks become gradient/nodeDiagonal if admitted.
 // No free(), dead arena range or source/cache metadata earns this credit.
 template<class P>static uint64_t transferCreditBytes(const P&p){return p.diagonalCacheCreditBytes()+p.apCacheCreditBytes();}
 template<class P>static uint64_t additionalAdmissionBytes(const P&p,const MemoryPlan&plan){const uint64_t need=admissionBytes(plan,p.n),credit=transferCreditBytes(p);return need>credit?need-credit:0;}

 // Prefer the original two-panel callbacks, even when dropping the optional
 // physical-root index is needed. A one-panel plan is a budget fallback only.
 static bool selectMemoryPlan(uint32_t pixels,uint32_t components,uint64_t edges,uint32_t width,double available,MemoryPlan&selected,uint64_t physicalRoom=UINT64_MAX,uint64_t reusableBytes=0){
  if(!std::isfinite(available)||available<0)return false;
  for(uint32_t choice=0;choice<4;choice++){
   const MemoryPlan plan=memoryPlan(pixels,components,edges,width,choice>=2,(choice&1)==0);
   // A whole work vector only helps when the old borrowed prefix is split.
   // Keep the legacy map/arc preference; never trade away a fast map just to
   // buy contiguous work. External budget and physical WASM cap both admit it.
   if(plan.prefixCapacity<components){
    const MemoryPlan contiguous=memoryPlan(pixels,components,edges,width,choice>=2,(choice&1)==0,true);
    const uint64_t physicalNeed=contiguous.bytes>reusableBytes?contiguous.bytes-reusableBytes:0;
    if(physicalNeed<=physicalRoom&&available>=double(admissionBytes(contiguous,pixels))){selected=contiguous;return true;}
   }
   if(available>=double(admissionBytes(plan,pixels))){selected=plan;return true;}
  }return false;
 }
 ~NativeIC0(){std::free(ownedWork);std::free(gradient);std::free(hdiag);std::free(componentIndex);std::free(arcRows);std::free(arcEdges);std::free(mass);std::free(mass8);std::free(mass16);std::free(rows);std::free(columns);std::free(curve);std::free(lower);std::free(diagonal);std::free(nodeDiagonal);std::free(tailWork);}
 template<class P>bool admit(P&p,double available){
  if(decided)return active;decided=true;
  if(!p.useMixed||!p.C||!p.E||p.E>UINT32_MAX/2)return false;
  massWidth=p.massPalette.bytesPerEdge();massPalette=massWidth<8?&p.massPalette:nullptr;
  // Previous compact Newton banks can be reused as gradient (D) and
  // nodeDiagonal (AP); both are actual independent allocations; this is capacity credit, never a free()
  // fiction. No bank is transferred when no complete IC0 plan fits.
  if(!std::isfinite(available)||available<0)return false;
  const uint64_t reusableBytes=transferCreditBytes(p);
  // Materialized capacity is already charged. Reserve one MiB for allocator
  // metadata and rounding before admitting the optional new whole work bank.
  const uint64_t materialized=emscripten_get_heap_size(),physicalMargin=1048576;
  const uint64_t physicalRoom=materialized<=p.heapCap&&physicalMargin<=uint64_t(p.heapCap)-materialized?uint64_t(p.heapCap)-materialized-physicalMargin:0;
  MemoryPlan plan{};if(!selectMemoryPlan(p.n,p.C,p.E,massWidth,available+double(reusableBytes),plan,physicalRoom,reusableBytes))return false;
  reductionPrefixCapacity=uint32_t(std::min<uint64_t>(p.C,6ULL*p.n/8));
  if(plan.contiguousWork){
   ownedWork=static_cast<double*>(std::malloc(uint64_t(p.C)*8));
   if(!ownedWork){workspaceAllocationRefusals++;plan=memoryPlan(p.n,p.C,p.E,massWidth,plan.compactArc,plan.mapBytes!=0,false);}
  }
  prefixCapacity=plan.prefixCapacity;mapBytes=plan.mapBytes;bytes=plan.bytes;compactArc=plan.compactArc;
  prefixWork=ownedWork?ownedWork:reinterpret_cast<double*>(p.curveCodes);
  // Reserve room for future packed output and a bounded accelerator window.
  rows=static_cast<uint32_t*>(std::malloc((uint64_t(p.C)+1)*4));
  columns=static_cast<uint32_t*>(std::malloc(p.E*4));
  curve=static_cast<double*>(std::malloc(p.E*8));
  lower=static_cast<double*>(std::malloc(p.E*8));
  diagonal=static_cast<double*>(std::malloc(uint64_t(p.C)*8));
  nodeDiagonal=p.takeApCacheForIC0();
  if(!nodeDiagonal)nodeDiagonal=static_cast<double*>(std::malloc(uint64_t(p.C)*8));
  if(p.C>prefixCapacity)tailWork=static_cast<double*>(std::malloc(uint64_t(p.C-prefixCapacity)*8));
  arcRows=static_cast<uint32_t*>(std::calloc(uint64_t(p.C)+1,4));
  arcEdges=static_cast<uint32_t*>(std::malloc(p.E*(compactArc?4ULL:8ULL)));
  if(massWidth==1)mass8=static_cast<uint8_t*>(std::malloc(p.E));
  else if(massWidth==2)mass16=static_cast<uint16_t*>(std::malloc(p.E*2));
  else mass=static_cast<double*>(std::malloc(p.E*8));
  if(mapBytes)componentIndex=static_cast<uint32_t*>(std::malloc(mapBytes));
  gradient=p.takeDiagonalCacheForIC0();
  if(!gradient)gradient=static_cast<double*>(std::malloc(uint64_t(p.C)*8));
  hdiag=static_cast<double*>(std::malloc(uint64_t(p.C)*8));
  if(!gradient||!hdiag||(mapBytes&&!componentIndex)||!nodeDiagonal||!arcRows||!arcEdges||(!mass&&!mass8&&!mass16)||!rows||!columns||!curve||!lower||!diagonal||(p.C>prefixCapacity&&!tailWork)){p.failure=-1;return false;}
  entries=0;active=true;return true;
 }
 bool storeMass(uint64_t edge,double value){
  if(massWidth==8){mass[edge]=value;return true;}
  uint32_t code;if(!massPalette||!massPalette->find(value,code)||(massWidth==1&&code>255)||code>65535)return false;
  if(massWidth==1)mass8[edge]=uint8_t(code);else mass16[edge]=uint16_t(code);return true;
 }
 double edgeMass(uint64_t edge)const{return massWidth==8?mass[edge]:massPalette->decode(massWidth==1?mass8[edge]:mass16[edge]);}
 // Before patternReady, diagonal is dead factor storage. Keep one physical
 // root and one insertion cursor in its two 32-bit words. memcpy avoids
 // aliasing a live double through a uint32_t pointer. Factorization later
 // overwrites every diagonal entry; outgoing rows then own physical roots.
 uint32_t patternRoot(uint32_t i)const{uint32_t value;std::memcpy(&value,reinterpret_cast<const uint8_t*>(diagonal)+8ULL*i,4);return value;}
 void setPatternRoot(uint32_t i,uint32_t value){std::memcpy(reinterpret_cast<uint8_t*>(diagonal)+8ULL*i,&value,4);}
 void setPatternCursor(uint32_t i,uint32_t value){std::memcpy(reinterpret_cast<uint8_t*>(diagonal)+8ULL*i+4,&value,4);}
 uint32_t takePatternCursor(uint32_t i){uint32_t value;std::memcpy(&value,reinterpret_cast<const uint8_t*>(diagonal)+8ULL*i+4,4);const uint32_t next=value+1;setPatternCursor(i,next);return value;}
 template<class P>void countRow(P&p,uint32_t r){
  const uint32_t i=p.cid(r);setPatternRoot(i,r);if(componentIndex)componentIndex[r]=i;rows[i]=uint32_t(entries);
  uint64_t degree=0;p.row(r,false,[&](uint32_t lo,uint32_t hi,double,double){degree++;uint32_t j=p.cid(lo==r?hi:lo);if(j<i)entries++;});maxPatternDegree=std::max(maxPatternDegree,degree);
 }
 template<class P>void fillRow(P&p,uint32_t r){
  const uint32_t i=p.cid(r);uint32_t at=rows[i];
  p.row(r,false,[&](uint32_t lo,uint32_t hi,double,double){const uint32_t j=p.cid(lo==r?hi:lo);if(j<i){if(at>=rows[i+1])p.failure=-4;else columns[at++]=j;}});
  if(at!=rows[i+1])p.failure=-4;
  std::sort(columns+rows[i],columns+rows[i+1]);
  p.row(r,false,[&](uint32_t lo,uint32_t hi,double,double m){uint32_t j=p.cid(lo==r?hi:lo);if(j<i){const auto slot=std::lower_bound(columns+rows[i],columns+rows[i+1],j);if(slot==columns+rows[i+1]||*slot!=j)p.failure=-4;else if(!storeMass(uint64_t(slot-columns),m))p.failure=-4;}});
 }

 // Fast mode stores E edge ids followed by E physical other roots.
 // Only when neither fast byte plan fits, compact mode stores the same E
 // physical other roots alone and finds edge ids in the unchanged lower CSR.
 // Only edges outgoing by immutable source level are linked. Insertion still
 // visits physical owner rows and their lower columns in the original order.
 template<class P>void countArcs(P&p,uint32_t i){
  const uint16_t level=p.level[patternRoot(i)];
  for(uint32_t e=rows[i];e<rows[i+1];e++){
   const uint32_t j=columns[e];const uint16_t other=p.level[patternRoot(j)];
   if(level==other){p.failure=-4;return;}arcRows[(level<other?i:j)+1]++;
  }
 }
 void prefixArcs(uint32_t i){arcRows[i+1]+=arcRows[i];setPatternCursor(i,arcRows[i]);}
 template<class P>void fillArcs(P&p,uint32_t i){
  const uint16_t level=p.level[patternRoot(i)];
  for(uint32_t e=rows[i];e<rows[i+1];e++){
   const uint32_t j=columns[e];const uint16_t other=p.level[patternRoot(j)];
   if(level==other){p.failure=-4;return;}const uint32_t from=level<other?i:j,to=level<other?j:i,at=takePatternCursor(from);
   if(at<arcRows[from]||at>=arcRows[from+1]||at>=entries){p.failure=-4;return;}
   if(compactArc)arcEdges[at]=patternRoot(to);else{arcEdges[at]=e;arcEdges[entries+at]=patternRoot(to);}
  }
 }
 template<class P,class Callback>bool row(P&p,uint32_t r,bool outgoing,Callback callback){
  // Target::row(false) bypasses this outgoing-only representation, so this
  // defensive fallback cannot recurse. Full incidence stays in the graph.
  if(!outgoing)return p.row(r,false,callback);
  const uint32_t i=p.cid(r);
  if(!compactArc){
   for(uint32_t a=arcRows[i];a<arcRows[i+1];a++){
    const uint32_t e=arcEdges[a],other=arcEdges[entries+a];
    lastEdge=e;callback(r,other,p.value(other)-p.value(r),edgeMass(e));lastEdge=0xffffffffU;
   }return true;
  }
  for(uint32_t a=arcRows[i];a<arcRows[i+1];a++){
    const uint32_t other=arcEdges[a];
    const uint32_t j=p.cid(other),owner=std::max(i,j),column=std::min(i,j);
    const auto slot=std::lower_bound(columns+rows[owner],columns+rows[owner+1],column);
    if(slot==columns+rows[owner+1]||*slot!=column){p.failure=-4;lastEdge=0xffffffffU;return false;}const uint32_t e=uint32_t(slot-columns);
    lastEdge=e;callback(r,other,p.value(other)-p.value(r),edgeMass(e));lastEdge=0xffffffffU;
  }return true;
 }
 template<class P,class Callback>void canonical(P&p,uint32_t r,Callback callback){
  for(uint32_t group=0;group<3;group++)p.row(r,false,[&](uint32_t lo,uint32_t hi,double d,double m){if(group==0?hi==r&&lo<r:group==1?lo==r:hi==r&&lo>r)callback(p.coefficients(lo,hi,d,m));});
 }
 template<class P>void factorRow(P&p,uint32_t r){
  const uint32_t i=p.cid(r);double d;
  if(derivativesReady)d=hdiag[i];
  else{double y=p.Y(r),a=.1*p.count(r)/p.n;

  d=a*(1/(y*y)+1/((1-y)*(1-y)));nodeDiagonal[i]=d;
  p.row(r,false,[&](uint32_t lo,uint32_t hi,double gap,double multiplicity){
   const auto e=p.coefficients(lo,hi,gap,multiplicity);
   const double slack=p.Y(hi)-p.Y(lo)-.1*gap,c=e.w/(slack*slack)+e.fidelity;
   d+=c;const uint32_t j=p.cid(lo==r?hi:lo);
   if(j<i){const auto slot=std::lower_bound(columns+rows[i],columns+rows[i+1],j);if(slot==columns+rows[i+1]||*slot!=j)p.failure=-4;else curve[slot-columns]=c;}
  });
  }
  const double original=d;
  for(uint32_t at=rows[i];at<rows[i+1];at++){
   const uint32_t j=columns[at];double v=-curve[at];uint32_t found=rows[i];
   const uint32_t prefix=at-rows[i],other=rows[j+1]-rows[j];
   if(prefix>16&&uint64_t(prefix)+other>uint64_t(other)*(32-__builtin_clz(prefix))){
    for(uint32_t k=rows[j];k<rows[j+1];k++){const auto pos=std::lower_bound(columns+rows[i],columns+at,columns[k]);if(pos!=columns+at&&*pos==columns[k])v-=lower[pos-columns]*lower[k]*diagonal[columns[k]];}
   }else for(uint32_t k=rows[j];k<rows[j+1];k++){
    const uint32_t col=columns[k];while(found<at&&columns[found]<col)found++;
    if(found==at)break;
    if(columns[found]==col)v-=lower[found]*lower[k]*diagonal[col];
   }
   const double lij=v/diagonal[j];lower[at]=lij;d-=lij*lij*diagonal[j];
  }
  diagonal[i]=std::max(d,1e-14*original);
  if(!(diagonal[i]>0&&std::isfinite(diagonal[i])))p.failure=-4;
 }
 void forward(uint32_t i,const float*residual){double z=residual[i];for(uint32_t at=rows[i];at<rows[i+1];at++)z-=lower[at]*this->at(columns[at]);this->at(i)=z;}
 void divide(uint32_t i){this->at(i)/=diagonal[i];}
 void backward(uint32_t i){const double z=this->at(i);for(uint32_t at=rows[i];at<rows[i+1];at++)this->at(columns[at])-=lower[at]*z;}
 template<class P>void productInit(P&p,uint32_t i){this->at(i)=nodeDiagonal[i]*double(p.cgDirection[i]);}
 template<class P>void productEdges(P&p,uint32_t i){for(uint32_t at=rows[i];at<rows[i+1];at++){const uint32_t j=columns[at];const double q=curve[at]*(double(p.cgDirection[i])-double(p.cgDirection[j]));this->at(i)+=q;this->at(j)-=q;}}

 void forwardSpan(uint32_t begin,uint32_t end,const float* __restrict residual){
  if(end>prefixCapacity){for(uint32_t i=begin;i<end;i++)forward(i,residual);return;}
  double* __restrict z=prefixWork;const uint32_t* __restrict row=rows;const uint32_t* __restrict col=columns;const double* __restrict l=lower;
  for(uint32_t i=begin;i<end;i++){double value=residual[i];for(uint32_t j=row[i];j<row[i+1];j++)value-=l[j]*z[col[j]];z[i]=value;}
 }
 void divideSpan(uint32_t begin,uint32_t end){
  if(end>prefixCapacity){for(uint32_t i=begin;i<end;i++)divide(i);return;}
  double* __restrict z=prefixWork;const double* __restrict d=diagonal;for(uint32_t i=begin;i<end;i++)z[i]/=d[i];
 }
 void backwardSpan(uint32_t begin,uint32_t end){
  if(end>prefixCapacity){for(uint32_t i=end;i>begin;)backward(--i);return;}
  double* __restrict z=prefixWork;const uint32_t* __restrict row=rows;const uint32_t* __restrict col=columns;const double* __restrict l=lower;
  for(uint32_t i=end;i>begin;){i--;const double value=z[i];for(uint32_t j=row[i];j<row[i+1];j++)z[col[j]]-=l[j]*value;}
 }
 double residualDotSpan(uint32_t begin,uint32_t end,const float* __restrict residual,double sum){
  if(end>reductionPrefixCapacity){for(uint32_t i=begin;i<end;i++)sum+=double(residual[i])*at(i);return sum;}
  const double* __restrict z=prefixWork;
  {
   #pragma clang fp reassociate(on)
   for(uint32_t i=begin;i<end;i++)sum+=double(residual[i])*z[i];
  }return sum;
 }
 template<class P>void directionProductSpan(P&p,uint32_t begin,uint32_t end){
  const double b=p.beta;float* __restrict direction=p.cgDirection;
  if(end>prefixCapacity){for(uint32_t i=begin;i<end;i++){direction[i]=float(at(i)+b*double(direction[i]));at(i)=nodeDiagonal[i]*double(direction[i]);}return;}
  double* __restrict z=prefixWork;const double* __restrict d=nodeDiagonal;
  for(uint32_t i=begin;i<end;i++){float v=float(z[i]+b*double(direction[i]));direction[i]=v;z[i]=d[i]*double(v);}
 }
 template<class P>void productEdgesSpan(P&p,uint32_t begin,uint32_t end,const float*vector=nullptr){
  if(end>prefixCapacity){const float*v=vector?vector:p.cgDirection;for(uint32_t i=begin;i<end;i++)for(uint32_t a=rows[i];a<rows[i+1];a++){uint32_t j=columns[a];double q=curve[a]*(double(v[i])-double(v[j]));at(i)+=q;at(j)-=q;}return;}
  double* __restrict z=prefixWork;const float* __restrict direction=vector?vector:p.cgDirection;const uint32_t* __restrict row=rows;const uint32_t* __restrict col=columns;const double* __restrict c=curve;
  for(uint32_t i=begin;i<end;i++){const double v=direction[i];double sum=z[i];for(uint32_t a=row[i];a<row[i+1];a++){uint32_t j=col[a];double q=c[a]*(v-double(direction[j]));sum+=q;z[j]-=q;}z[i]=sum;}
 }
 double productDotSpan(uint32_t begin,uint32_t end,const float* __restrict direction,double sum){
  if(end>reductionPrefixCapacity){for(uint32_t i=begin;i<end;i++)sum+=double(direction[i])*double(float(at(i)));return sum;}
  const double* __restrict z=prefixWork;
  {
   #pragma clang fp reassociate(on)
   for(uint32_t i=begin;i<end;i++)sum+=double(direction[i])*double(float(z[i]));
  }return sum;
 }
 template<class P>double updateSpan(P&p,uint32_t begin,uint32_t end){
  const double alpha=p.alpha;double norm=p.residualNorm;float* __restrict step=p.cgStep;float* __restrict residual=p.cgResidual;const float* __restrict direction=p.cgDirection;
  if(end>reductionPrefixCapacity){for(uint32_t i=begin;i<end;i++){step[i]=float(double(step[i])+alpha*double(direction[i]));float ap=float(at(i));residual[i]=float(double(residual[i])-alpha*double(ap));norm+=double(residual[i])*double(residual[i]);}return norm;}
  const double* __restrict z=prefixWork;
  {
   #pragma clang fp reassociate(on)
   for(uint32_t i=begin;i<end;i++){step[i]=float(double(step[i])+alpha*double(direction[i]));float ap=float(z[i]);float r=float(double(residual[i])-alpha*double(ap));residual[i]=r;norm+=double(r)*double(r);}
  }return norm;
 }
};

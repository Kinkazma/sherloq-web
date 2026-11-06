// Binary64 scalar graph Newton/PCG arithmetic. No fast-math, no f32 input.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <vector>
struct Target {
 int n,e,cg=0,preconditioner=0; const uint32_t *lo,*hi;const double *area,*difference,*multiplicity;
 std::vector<double> y,w,floor,wanted,fidelity,curvature,slack,g,diag,hdiag,step,r,z,direction,product,trial;
 double info[8]{},rz=0,cgTolerance=0,objectiveValue=0,cgRelative=0,requestedMax=-1;int certifiedSteps=0;bool cgDone=false,patternReady=false;
 std::vector<uint32_t> row,column,edge;
 std::vector<double> lower,ldiag;
 Target(int nn,int ee,const uint32_t*l,const uint32_t*h,const double*a,const double*dd,const double*m):n(nn),e(ee),lo(l),hi(h),area(a),difference(dd),multiplicity(m),y(n),w(e),floor(e),wanted(e),fidelity(e),curvature(e),slack(e),g(n),diag(n),hdiag(n),step(n),r(n),z(n),direction(n),product(n),trial(n){}
 double objective(const std::vector<double>&v){double f=0;for(int i=0;i<n;i++){if(!(v[i]>0&&v[i]<1))return INFINITY;f-=.1*area[i]*(log(v[i])+log1p(-v[i]));}for(int j=0;j<e;j++){double delta=v[hi[j]]-v[lo[j]],s=delta-floor[j];if(!(s>0))return INFINITY;double err=delta-wanted[j];f+=-w[j]*log(s)+.5*fidelity[j]*err*err;}return f;}

 // Armijo's summed objective can lose the final decrease to rounding. Accept
 // such a full feasible step only when the original maximum-error certificate
 // already proves it sufficient. target_gradient recomputes that certificate
 // before publication. Reference/RMS-only solves never take this path.
 bool trialCertified(){
  if(!(requestedMax>0))return false;
  for(int i=0;i<n;i++){double a=trial[i],b=1-a;if(!(a>0&&a<1))return false;z[i]=.1*area[i]*(-1/a+1/b);}
  for(int j=0;j<e;j++){auto l=lo[j],h=hi[j];double delta=trial[h]-trial[l],s=delta-floor[j];if(!(s>0))return false;double force=-w[j]/s+fidelity[j]*(delta-wanted[j]);z[h]+=force;z[l]-=force;}
  double bound=0;
  for(int i=0;i<n;i++){
   if(!std::isfinite(z[i]))return false;
   double linear=fabs(z[i])/(.8*area[i]);
   double a=trial[i],h=-1/a+1/(1-a),value=h-z[i]/(.1*area[i]);
   double inverse=value>=0?1-2/(2+value+hypot(value,2)):2/(2-value+hypot(value,2));
   double nonlinear=fabs(a-inverse)+64*2.220446049250313e-16;
   bound=std::max(bound,std::min(linear,nonlinear));
  }
  return std::isfinite(bound)&&bound<=requestedMax;
 }
 void multiply(){for(int i=0;i<n;i++)product[i]=diag[i]*direction[i];for(int j=0;j<e;j++){auto l=lo[j],h=hi[j];double q=curvature[j]*(direction[h]-direction[l]);product[h]+=q;product[l]-=q;}}
 void pattern(){
  if(patternReady)return;row.assign(n+1,0);column.resize(e);edge.resize(e);lower.resize(e);ldiag.resize(n);
  // One contiguous symbolic staging array replaces one allocation per node.
  // Lexicographic row order is identical to the previous vector-of-vectors.
  for(int j=0;j<e;j++)row[std::max(lo[j],hi[j])+1]++;
  for(int i=0;i<n;i++)row[i+1]+=row[i];
  std::vector<uint32_t> cursor(row);
  std::vector<std::pair<uint32_t,uint32_t>> entries(e);
  for(int j=0;j<e;j++)entries[cursor[std::max(lo[j],hi[j])]++]={std::min(lo[j],hi[j]),j};
  for(int i=0;i<n;i++)std::sort(entries.begin()+row[i],entries.begin()+row[i+1]);
  for(int j=0;j<e;j++){column[j]=entries[j].first;edge[j]=entries[j].second;}
  patternReady=true;
 }
 // IC(0) in unit-lower LDL^T form: avoids one dependent division per row in
 // each triangular pass. This changes the preconditioner arithmetic only;
 // the exact Hessian action and outer objective remain in binary64.
 void factor(){
  pattern();
  for(int i=0;i<n;i++){
   double diagonal=hdiag[i];
   for(uint32_t at=row[i];at<row[i+1];at++){
    uint32_t j=column[at];double value=-curvature[edge[at]];
    // Both symbolic rows are sorted. Advance one merge cursor instead of
    // re-running a binary search for every predecessor. Products retain the
    // original row-j order. The LDL form can change rounding relative to LL^T.
    const uint32_t prefix=at-row[i],other=row[j+1]-row[j];
    // Tiny image-graph rows use the direct merge. Only unusually long
    // prefixes compare conservative search/merge work; this avoids scanning
    // a hub prefix for a short predecessor row. This is topology-only and
    // neither executes a calibration nor changes numerical iteration rules.
    const bool useSearch=prefix>16 && uint64_t(prefix)+other>
      uint64_t(other)*(32-__builtin_clz(prefix));
    if(useSearch){
     for(uint32_t k=row[j];k<row[j+1];k++){
      auto found=std::lower_bound(column.begin()+row[i],column.begin()+at,column[k]);
      if(found!=column.begin()+at&&*found==column[k])value-=lower[found-column.begin()]*lower[k]*ldiag[column[k]];
     }
    }else{
     uint32_t found=row[i];
     for(uint32_t k=row[j];k<row[j+1];k++){
      uint32_t col=column[k];
      while(found<at&&column[found]<col)found++;
      if(found==at)break;
      if(column[found]==col)value-=lower[found]*lower[k]*ldiag[column[k]];
     }
    }
    const double dj=ldiag[j],lij=value/dj;lower[at]=lij;diagonal-=lij*lij*dj;
   }
   // This shifts the preconditioner only. The objective and Hessian matvec
   // remain unchanged; the PCG residual is checked against the true system.
   ldiag[i]=std::max(diagonal,1e-14*hdiag[i]);
  }
 }
 void precondition(){
  if(!preconditioner){for(int i=0;i<n;i++)z[i]=r[i]/hdiag[i];return;}
  for(int i=0;i<n;i++){double value=r[i];for(uint32_t at=row[i];at<row[i+1];at++)value-=lower[at]*z[column[at]];z[i]=value;}
  for(int i=0;i<n;i++)z[i]/=ldiag[i];
  for(int i=n-1;i>=0;i--){const double zi=z[i];for(uint32_t at=row[i];at<row[i+1];at++)z[column[at]]-=lower[at]*zi;}
 }
};
extern "C" {
uintptr_t target_create(int n,int e,const uint32_t*lo,const uint32_t*hi,const double*area,const double*d,const double*mult){try{return reinterpret_cast<uintptr_t>(new Target(n,e,lo,hi,area,d,mult));}catch(...){return 0;}}
void target_destroy(Target*t){delete t;}
void target_preconditioner(Target*t,int mode){t->preconditioner=mode;}
void target_forcing(Target*t,double relative){t->cgRelative=relative;}
void target_precision(Target*t,double bound){t->requestedMax=bound;t->certifiedSteps=0;}
int target_certified_steps(Target*t){return t->certifiedSteps;}
void target_init(Target*t,double micro,double median,double weak,const double*initial){
 double gain=std::max(4*pow(16.,micro),(.5+7.5*micro)/(255*weak)),sum=0;
 for(int j=0;j<t->e;j++){double d=t->difference[j];t->w[j]=t->multiplicity[j]*sqrt(d/(d+median));sum+=t->w[j];t->floor[j]=.1*d;t->wanted[j]=gain*d/(1+(gain-1)*d);}
 for(int j=0;j<t->e;j++){t->w[j]/=sum;double a=t->difference[j]/(8*weak);t->fidelity[j]=20*t->w[j]/(1+pow(a,4))/(t->wanted[j]*t->wanted[j]);}
 std::copy(initial,initial+t->n,t->y.begin());t->objectiveValue=t->objective(t->y);t->cg=0;t->info[3]=gain;
}
const double*target_values(Target*t){return t->y.data();}
const double*target_info(Target*t){return t->info;}
int target_try_initial(Target*t,const double*candidate){std::copy(candidate,candidate+t->n,t->trial.begin());double f=t->objective(t->trial);if(f<t->objectiveValue){t->y.swap(t->trial);t->objectiveValue=f;return 1;}return 0;}
int target_gradient(Target*t){try{
 if(!std::isfinite(t->objectiveValue))return -3;
 for(int i=0;i<t->n;i++){double a=t->y[i],b=1-a;t->g[i]=.1*t->area[i]*(-1/a+1/b);t->diag[i]=.1*t->area[i]*(1/(a*a)+1/(b*b));t->hdiag[i]=t->diag[i];}
 for(int j=0;j<t->e;j++){auto l=t->lo[j],h=t->hi[j];double delta=t->y[h]-t->y[l];t->slack[j]=delta-t->floor[j];double force=-t->w[j]/t->slack[j]+t->fidelity[j]*(delta-t->wanted[j]);t->g[h]+=force;t->g[l]-=force;t->curvature[j]=t->w[j]/(t->slack[j]*t->slack[j])+t->fidelity[j];t->hdiag[h]+=t->curvature[j];t->hdiag[l]+=t->curvature[j];}
 double norm=0,maxError=0,maxLinear=0,maxNonlinear=0;
 for(int i=0;i<t->n;i++){
  if(!std::isfinite(t->g[i]))return -3;
  norm+=t->g[i]*t->g[i]/t->area[i];double linear=fabs(t->g[i])/(.8*t->area[i]);
  double y=t->y[i],h=-1/y+1/(1-y),value=h-t->g[i]/(.1*t->area[i]);
  double inverse=value>=0?1-2/(2+value+hypot(value,2)):2/(2-value+hypot(value,2));
  double nonlinear=fabs(y-inverse)+64*2.220446049250313e-16;
  maxLinear=std::max(maxLinear,linear);maxNonlinear=std::max(maxNonlinear,nonlinear);maxError=std::max(maxError,std::min(linear,nonlinear));
 }t->info[0]=sqrt(norm)/.8;t->info[1]=maxError;t->info[2]=t->objectiveValue;t->info[4]=t->cg;t->info[6]=maxLinear;t->info[7]=maxNonlinear;
 return 0;
}catch(const std::bad_alloc&){return -1;}catch(...){return -2;}}
int target_factor(Target*t){try{if(t->preconditioner)t->factor();return 0;}catch(const std::bad_alloc&){return -1;}catch(...){return -2;}}
void target_cg_begin(Target*t){
 t->rz=0;double norm=0;t->cgDone=false;
 // Only PCG reductions may reassociate. The objective/gradient/certificate
 // and the graph Hessian action retain their strict floating-point semantics.
 {
  #pragma clang fp reassociate(on)
  for(int i=0;i<t->n;i++){t->step[i]=0;t->r[i]=-t->g[i];norm+=t->g[i]*t->g[i];}
 }
 t->precondition();
 {
  #pragma clang fp reassociate(on)
  double rz=0;for(int i=0;i<t->n;i++){t->direction[i]=t->z[i];rz+=t->r[i]*t->z[i];}t->rz=rz;
 }
 double relative=t->cgRelative>0?t->cgRelative:std::min(.1,std::max(1e-8,t->info[0]*.01));t->cgTolerance=relative*relative*norm;t->info[5]=0;
}
int target_cg_batch(Target*t,int iterations){
 if(t->cgDone)return 0;
 for(int k=0;k<iterations&&t->info[5]<2000;k++){
  t->multiply();double denominator=0;
  {
   #pragma clang fp reassociate(on)
   for(int i=0;i<t->n;i++)denominator+=t->direction[i]*t->product[i];
  }
  if(!(denominator>0)){t->cgDone=true;break;}
  double alpha=t->rz/denominator,rr=0;
  {
   #pragma clang fp reassociate(on)
   for(int i=0;i<t->n;i++){t->step[i]+=alpha*t->direction[i];t->r[i]-=alpha*t->product[i];rr+=t->r[i]*t->r[i];}
  }
  t->cg++;t->info[5]++;
  if(rr<=t->cgTolerance){t->cgDone=true;break;}
  t->precondition();double next=0;
  {
   #pragma clang fp reassociate(on)
   for(int i=0;i<t->n;i++)next+=t->r[i]*t->z[i];
  }
  double beta=next/t->rz;for(int i=0;i<t->n;i++)t->direction[i]=t->z[i]+beta*t->direction[i];t->rz=next;
 }
 return !t->cgDone&&t->info[5]<2000;
}
double target_accept(Target*t){
 double directional=0;for(int i=0;i<t->n;i++)directional+=t->g[i]*t->step[i];
 if(!(directional<0)){directional=0;for(int i=0;i<t->n;i++){t->step[i]=-t->g[i]/t->hdiag[i];directional+=t->g[i]*t->step[i];}}
 double rate=1;for(int i=0;i<t->n;i++){if(t->step[i]<0)rate=std::min(rate,-.99*t->y[i]/t->step[i]);if(t->step[i]>0)rate=std::min(rate,.99*(1-t->y[i])/t->step[i]);}
 for(int j=0;j<t->e;j++){double ds=t->step[t->hi[j]]-t->step[t->lo[j]];if(ds<0)rate=std::min(rate,-.99*t->slack[j]/ds);}
 for(int back=0;back<55;back++){for(int i=0;i<t->n;i++)t->trial[i]=t->y[i]+rate*t->step[i];double f=t->objective(t->trial);if(f<=t->objectiveValue+1e-4*rate*directional){t->y.swap(t->trial);t->objectiveValue=f;return rate;}if(back==0&&std::isfinite(f)&&f<=t->objectiveValue+1e-12*(1+fabs(t->objectiveValue))&&t->trialCertified()){t->certifiedSteps++;t->y.swap(t->trial);t->objectiveValue=f;return rate;}rate*=.5;}
 return -1;
}
}

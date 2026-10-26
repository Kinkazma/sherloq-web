// Additive native support-aware operators. The unchanged full-domain kernels
// remain available from the pinned independent SSG implementation below.
#include "../ssg-full/localization.cpp"
#include <limits>

static bool ssg_all_known(const uint8_t*known,size_t n){for(size_t i=0;i<n;i++)if(!known[i])return false;return true;}

// A physical outer-image pad follows the native zero/replicate policy. A hole
// inside the image is unknown and contributes neither numerator nor weight.
// Horizontal numerators and weights are carried through the vertical pass;
// normalizing separately on each line would describe a different 2D kernel.
static void ssg_observed_gaussian(const double*in,const uint8_t*known,double*out,uint8_t*valid,int w,int h,int r,double sigma,bool replicate){
 const size_t n=(size_t)w*h;
 if(ssg_all_known(known,n)){blur(in,out,w,h,r,sigma,replicate);std::fill(valid,valid+n,1);return;}
 vector<double> numerator(n),weight(n),kernel(2*r+1);double total=0;
 for(int i=-r;i<=r;i++){kernel[i+r]=exp(-i*i/(2*sigma*sigma));total+=kernel[i+r];}for(auto&v:kernel)v/=total;
 full_parallel(h,[&](int y){for(int x=0;x<w;x++){double a=0,b=0;for(int dx=-r;dx<=r;dx++){
  const int raw=x+dx,xx=clamp(raw,w);const double k=kernel[dx+r];
  if(!replicate&&(raw<0||raw>=w)){b+=k;continue;}const size_t at=(size_t)y*w+xx;if(known[at]){a+=in[at]*k;b+=k;}
 }numerator[(size_t)y*w+x]=a;weight[(size_t)y*w+x]=b;}});
 full_parallel(h,[&](int y){for(int x=0;x<w;x++){double a=0,b=0;for(int dy=-r;dy<=r;dy++){
  const int raw=y+dy,yy=clamp(raw,h);const double k=kernel[dy+r];
  if(!replicate&&(raw<0||raw>=h)){b+=k;continue;}const size_t at=(size_t)yy*w+x;a+=numerator[at]*k;b+=weight[at]*k;
 }const size_t at=(size_t)y*w+x;valid[at]=b>1e-14;out[at]=valid[at]?a/b:std::numeric_limits<double>::quiet_NaN();}});
}

extern "C" {
int ssg_strict_blur(const double*in,const uint8_t*known,double*out,uint8_t*valid,int w,int h,int radius,double sigma,int replicate){try{
 if(!in||!known||!out||!valid||w<1||h<1||radius<0||radius>INT_MAX/2||!(sigma>0)||!std::isfinite(sigma))return -1;
 ssg_observed_gaussian(in,known,out,valid,w,h,radius,sigma,replicate!=0);
 // Blurred RGB/gray context remains on its admitted source domain; derived
// values at a hole are not silently turned into new RGB observations.
 for(size_t i=0;i<(size_t)w*h;i++)if(!known[i]){valid[i]=0;out[i]=std::numeric_limits<double>::quiet_NaN();}return 0;
}catch(...){return -2;}}

int ssg_strict_warp(const double*in,const uint8_t*known,double*out,uint8_t*valid,const double*m,int w,int h,int reverse){try{
 if(!in||!known||!out||!valid||!m||w<1||h<1)return -1;for(int i=0;i<6;i++)if(!std::isfinite(m[i]))return -1;const double a=m[0],b=m[1],tx=m[2],c=m[3],d=m[4],ty=m[5],det=a*d-b*c;if(!std::isfinite(det)||det==0)return -1;
 if(ssg_all_known(known,(size_t)w*h)){warp(in,out,w,h,m,reverse!=0);std::fill(valid,valid+(size_t)w*h,1);return 0;}
 full_parallel(h,[&](int y){for(int x=0;x<w;x++){
  const double xx=x+1,yy=y+1,sx=reverse?a*xx+b*yy+tx:(d*(xx-tx)-b*(yy-ty))/det,sy=reverse?c*xx+d*yy+ty:(-c*(xx-tx)+a*(yy-ty))/det;
  const double px=sx-1,py=sy-1;const size_t target=(size_t)y*w+x;
  // A finite transform far outside the physical image is its native zero
  // padding, not an overflowing float-to-int conversion.
  if(!std::isfinite(px)||!std::isfinite(py)||px<=-1||py<=-1||px>=w||py>=h){valid[target]=1;out[target]=0;continue;}
  const int ix=floor(px),iy=floor(py);const double fx=px-ix,fy=py-iy;double value=0,weight=0;
  for(int j=0;j<2;j++)for(int i=0;i<2;i++){const double k=(i?fx:1-fx)*(j?fy:1-fy);if(!k)continue;const int rx=ix+i,ry=iy+j;if(rx<0||ry<0||rx>=w||ry>=h){weight+=k;continue;}const size_t at=(size_t)ry*w+rx;if(known[at]){value+=in[at]*k;weight+=k;}}
  const size_t at=(size_t)y*w+x;valid[at]=weight>1e-14;out[at]=valid[at]?value/weight:std::numeric_limits<double>::quiet_NaN();
 }});return 0;
}catch(...){return -2;}}

int ssg_strict_ssim(const double*a,const double*b,const uint8_t*knownA,const uint8_t*knownB,double*out,uint8_t*valid,int w,int h,double sigma){try{
 if(!a||!b||!knownA||!knownB||!out||!valid||w<1||h<1||!(sigma>0)||!std::isfinite(sigma)||ceil(3*sigma)>INT_MAX/2)return -1;const size_t n=(size_t)w*h;
 if(ssg_all_known(knownA,n)&&ssg_all_known(knownB,n)){ssim(a,b,out,w,h,sigma);std::fill(valid,valid+n,1);return 0;}
 const int radius=ceil(3*sigma);vector<uint8_t> joint(n),temporaryValid(n);vector<double> ma(n),mb(n),aa(n),bb(n),ab(n),temporary(n);
 for(size_t i=0;i<n;i++)joint[i]=knownA[i]&&knownB[i];
 ssg_observed_gaussian(a,joint.data(),ma.data(),valid,w,h,radius,sigma,true);ssg_observed_gaussian(b,joint.data(),mb.data(),temporaryValid.data(),w,h,radius,sigma,true);
 for(size_t i=0;i<n;i++)temporary[i]=joint[i]?a[i]*a[i]:0;ssg_observed_gaussian(temporary.data(),joint.data(),aa.data(),temporaryValid.data(),w,h,radius,sigma,true);
 for(size_t i=0;i<n;i++)temporary[i]=joint[i]?b[i]*b[i]:0;ssg_observed_gaussian(temporary.data(),joint.data(),bb.data(),temporaryValid.data(),w,h,radius,sigma,true);
 for(size_t i=0;i<n;i++)temporary[i]=joint[i]?a[i]*b[i]:0;ssg_observed_gaussian(temporary.data(),joint.data(),ab.data(),temporaryValid.data(),w,h,radius,sigma,true);
 full_parallel(h,[&](int y){for(int x=0;x<w;x++){const size_t i=(size_t)y*w+x;if(!knownA[i]||!valid[i]){valid[i]=0;out[i]=std::numeric_limits<double>::quiet_NaN();continue;}
  const double va=std::max(0.0,aa[i]-ma[i]*ma[i]),vb=std::max(0.0,bb[i]-mb[i]*mb[i]),sd=sqrt(va*vb),cov=ab[i]-ma[i]*mb[i],l=(2*ma[i]*mb[i]+.0001)/(ma[i]*ma[i]+mb[i]*mb[i]+.0001),c=(2*sd+.0009)/(va+vb+.0009),s=(cov+.00045)/(sd+.00045);out[i]=l*l*l*c*s*s;
 }});return 0;
}catch(...){return -2;}}

// Native morphology on an observed binary field. The neutral infinities are
// not RGB samples. The same four-line Minkowski footprint is retained; final
// domain restriction and connectivity belong to the strict localizer.
int ssg_strict_morph(const double*in,const uint8_t*known,double*out,uint8_t*valid,int w,int h,int radius,int dilation){try{
 if(!in||!known||!out||!valid||w<1||h<1||radius<0||radius>512)return -1;const size_t n=(size_t)w*h;vector<double> observed(n);for(size_t i=0;i<n;i++)observed[i]=known[i]?in[i]:(dilation?-INFINITY:INFINITY);n4(observed.data(),out,w,h,radius,dilation!=0);for(size_t i=0;i<n;i++){valid[i]=std::isfinite(out[i]);if(!valid[i])out[i]=std::numeric_limits<double>::quiet_NaN();}return 0;
}catch(...){return -2;}}

int ssg_strict_salience(const float*edge,const uint8_t*known,const double*points,int count,int w,int h,double sigma,double*out){try{
 if(!edge||!known||!points||!out||count<0||w<1||h<1||!(sigma>0))return -1;
 const size_t n=(size_t)w*h;if(ssg_all_known(known,n))return ssg_full_salience(edge,points,count,w,h,sigma,out);
 vector<double> input(n),filtered(n);vector<uint8_t> valid(n);for(size_t i=0;i<n;i++)input[i]=known[i]?edge[i]:0;
 ssg_observed_gaussian(input.data(),known,filtered.data(),valid.data(),w,h,ceil(3*sqrt(1/(2*sigma))),sqrt(1/(2*sigma)),false);
 double low=INFINITY,high=-INFINITY;for(int i=0;i<count;i++){const int x=round(points[i*3]),y=round(points[i*3+1]);if(x<0||x>=w||y<0||y>=h||!known[(size_t)y*w+x]||!valid[(size_t)y*w+x])return -1;out[i]=filtered[(size_t)y*w+x];low=std::min(low,out[i]);high=std::max(high,out[i]);}
 for(int i=0;i<count;i++)out[i]=high>low?1+(out[i]-low)/(high-low):1;return 0;
}catch(...){return -2;}}
}

// A true exclusion is a boundary of the analysis domain, not a zero-valued
// hole which native connected-component filling is allowed to paint over.
static void ssg_observed_components(uint8_t*mask,const uint8_t*domain,int w,int h,double area,const uint8_t*points,bool holes=false){
 const size_t n=(size_t)w*h;vector<uint8_t> seen(n);vector<int> queue;queue.reserve(n);
 for(int start=0;start<(int)n;start++){
  const bool wanted=domain[start]&&(holes?!mask[start]:mask[start]);if(!wanted||seen[start])continue;queue.clear();queue.push_back(start);seen[start]=1;bool border=false;int support=0;
  for(size_t j=0;j<queue.size();j++){const int i=queue[j],x=i%w,y=i/w;support+=points?points[i]:0;border|=x==0||x==w-1||y==0||y==h-1;const int near[4]={x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1};
   for(const int next:near){if(next<0||!domain[next]){border=true;continue;}if(!seen[next]&&(holes?!mask[next]:mask[next])){seen[next]=1;queue.push_back(next);}}
  }
  if(holes){if(!border)for(const int at:queue)mask[at]=1;}
  else if(queue.size()<area||(points&&support<3))for(const int at:queue)mask[at]=0;
 }
}

extern "C" {
int ssg_strict_localize(const double*blurred,const uint8_t*known,const double*roi,const double*matrix,const double*points,int count,int w,int h,double threshold,double minarea,double sigma,int opening,uint8_t*out,uint8_t*directSsim,const uint8_t*candidates=nullptr){try{
 if(!blurred||!known||!roi||!matrix||!points||!out||!directSsim||count<0||w<1||h<1)return -1;
 if(!candidates)candidates=known;const size_t n=(size_t)w*h;if(ssg_all_known(known,n)&&ssg_all_known(candidates,n)){const int status=ssg_full_localize(blurred,roi,matrix,points,count,w,h,threshold,minarea,sigma,opening,out);if(status==0)std::fill(directSsim,directSsim+n,1);return status;}
 vector<double> warped(n),map(n),one(n),two(n);vector<uint8_t> warpedKnown(n),ssimKnown(n),oneKnown(n),twoKnown(n),pointsMap(n),current(n);
 std::fill(out,out+n,0);std::fill(directSsim,directSsim+n,0);size_t population=0;for(size_t i=0;i<n;i++)population+=candidates[i]!=0;
 for(int i=0;i<count;i++){const int x=round(points[i*2]),y=round(points[i*2+1]);if(x>=0&&x<w&&y>=0&&y<h&&candidates[(size_t)y*w+x])pointsMap[(size_t)y*w+x]=1;}
 for(int direction=0;direction<2;direction++){
  int status=ssg_strict_warp(blurred,known,warped.data(),warpedKnown.data(),matrix,w,h,direction);if(status)return status;
  status=ssg_strict_ssim(blurred,warped.data(),known,warpedKnown.data(),map.data(),ssimKnown.data(),w,h,sigma);if(status)return status;
  for(size_t i=0;i<n;i++){oneKnown[i]=candidates[i]&&known[i]&&ssimKnown[i];directSsim[i]|=oneKnown[i];one[i]=oneKnown[i]&&map[i]*roi[i]>=threshold?1:0;}
  status=ssg_strict_morph(one.data(),oneKnown.data(),two.data(),twoKnown.data(),w,h,opening,0);if(status)return status;
  status=ssg_strict_morph(two.data(),twoKnown.data(),one.data(),oneKnown.data(),w,h,opening,1);if(status)return status;
  for(size_t i=0;i<n;i++)current[i]=candidates[i]&&oneKnown[i]&&one[i]>0;
  ssg_observed_components(current.data(),candidates,w,h,population*minarea,nullptr);
  ssg_observed_components(current.data(),candidates,w,h,0,nullptr,true);
  for(size_t i=0;i<n;i++)out[i]|=current[i];
 }
 ssg_observed_components(out,candidates,w,h,population*minarea,pointsMap.data());return 0;
}catch(...){return -2;}}
}

// Retained native SSIM fields, with exact per-group postprocessing.
extern "C" int ssg_split_prepare(const double*blurred,const uint8_t*known,const double*matrix,int w,int h,double sigma,double*maps,uint8_t*valid){try{
 if(!blurred||!known||!matrix||!maps||!valid||w<1||h<1)return -1;
 const size_t n=(size_t)w*h;vector<double> warped(n);vector<uint8_t> warpedKnown(n);
 for(int direction=0;direction<2;direction++){
  int status=ssg_strict_warp(blurred,known,warped.data(),warpedKnown.data(),matrix,w,h,direction);if(status)return status;
  status=ssg_strict_ssim(blurred,warped.data(),known,warpedKnown.data(),maps+direction*n,valid+direction*n,w,h,sigma);if(status)return status;
 }return 0;
}catch(...){return -2;}}
extern "C" int ssg_split_post(const double*maps,const uint8_t*mapKnown,const uint8_t*known,const uint8_t*candidates,const double*roi,const double*points,int count,int w,int h,double threshold,double minarea,int opening,uint8_t*out,uint8_t*direct){try{
 if(!maps||!mapKnown||!known||!candidates||!roi||!points||!out||!direct||count<0||w<1||h<1)return -1;
 const size_t n=(size_t)w*h;const bool full=ssg_all_known(known,n)&&ssg_all_known(candidates,n);
 vector<double>one(n),two(n);vector<uint8_t>oneKnown(n),twoKnown(n),pointsMap(n),current(n);
 std::fill(out,out+n,0);std::fill(direct,direct+n,0);size_t population=0;for(size_t i=0;i<n;i++)population+=candidates[i]!=0;
 for(int i=0;i<count;i++){const int x=round(points[i*2]),y=round(points[i*2+1]);if(x>=0&&x<w&&y>=0&&y<h&&(full||candidates[(size_t)y*w+x]))pointsMap[(size_t)y*w+x]=1;}
 for(int direction=0;direction<2;direction++){
  const double*map=maps+direction*n;const uint8_t*ssimKnown=mapKnown+direction*n;
  if(full){for(size_t i=0;i<n;i++)one[i]=map[i]*roi[i]>=threshold?1:0;n4(one.data(),two.data(),w,h,opening,false);n4(two.data(),one.data(),w,h,opening,true);for(size_t i=0;i<n;i++)current[i]=one[i]>0;components(current.data(),w,h,n*minarea,nullptr);components(current.data(),w,h,0,nullptr,true);}
  else{for(size_t i=0;i<n;i++){oneKnown[i]=candidates[i]&&known[i]&&ssimKnown[i];direct[i]|=oneKnown[i];one[i]=oneKnown[i]&&map[i]*roi[i]>=threshold?1:0;}
   int status=ssg_strict_morph(one.data(),oneKnown.data(),two.data(),twoKnown.data(),w,h,opening,0);if(status)return status;status=ssg_strict_morph(two.data(),twoKnown.data(),one.data(),oneKnown.data(),w,h,opening,1);if(status)return status;
   for(size_t i=0;i<n;i++)current[i]=candidates[i]&&oneKnown[i]&&one[i]>0;ssg_observed_components(current.data(),candidates,w,h,population*minarea,nullptr);ssg_observed_components(current.data(),candidates,w,h,0,nullptr,true);
  }for(size_t i=0;i<n;i++)out[i]|=current[i];
 }
 if(full){components(out,w,h,n*minarea,pointsMap.data());std::fill(direct,direct+n,1);}else ssg_observed_components(out,candidates,w,h,population*minarea,pointsMap.data());return 0;
}catch(...){return -2;}}


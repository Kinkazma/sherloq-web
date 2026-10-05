// Included after the qualified OpenCV SIFT translation unit. Study kernel;
// global octave bases and global selection are owned by its paged controller.
#include <map>
namespace cv {
static Mat m3Initial,m3Descriptors,m3Kernel;
static std::vector<Mat> m3Gaussian,m3Dog;
static std::vector<float> m3Packed;
static std::vector<KeyPoint> m3Points;
static int m3Layers=3,m3Total=0;
static void m3Pack(){m3Packed.clear();m3Packed.reserve(m3Points.size()*7);for(const auto& p:m3Points)m3Packed.insert(m3Packed.end(),{p.pt.x,p.pt.y,p.size,p.angle,p.response,float(p.octave),float(p.class_id)});}
static std::vector<KeyPoint> m3Unpack(const float* p,int count){std::vector<KeyPoint> out;out.reserve(count);for(int i=0;i<count;i++,p+=7)out.emplace_back(p[0],p[1],p[2],p[3],p[4],int(p[5]),int(p[6]));return out;}
extern "C" {
void m3_sift_release(){m3Initial.release();m3Gaussian.clear();m3Dog.clear();m3Descriptors.release();std::vector<KeyPoint>().swap(m3Points);std::vector<float>().swap(m3Packed);std::vector<int>().swap(m3SiftEscapes);m3SiftActive=false;}
int m3_sift_upsample(const unsigned char* gray,int w,int h){try{Mat src;Mat(h,w,CV_8U,const_cast<unsigned char*>(gray)).convertTo(src,CV_32F);resize(src,m3Initial,Size(w*2,h*2),0,0,INTER_LINEAR);return 1;}catch(...){return -1;}}
int m3_sift_kernel(int layers,int step){try{double sigma;if(step==0){float a=1.6f;sigma=std::sqrt(std::max(a*a-1.f,.01f));}else{const double k=std::pow(2.,1./layers),prev=std::pow(k,double(step-1))*1.6,total=prev*k;sigma=std::sqrt(total*total-prev*prev);}m3Kernel=getGaussianKernel(cvRound(sigma*8+1)|1,sigma,CV_32F);return m3Kernel.rows;}catch(...){return -1;}}
const float* m3_sift_kernel_data(){return m3Kernel.ptr<float>();}
int m3_sift_build_supplied(const float* planes,int w,int h,int layers){try{m3Layers=layers;m3Gaussian.clear();m3Dog.clear();for(int i=0;i<layers+3;i++)m3Gaussian.emplace_back(h,w,CV_32F,const_cast<float*>(planes+i*w*h));SIFT_Impl s(0,layers);s.buildDoGPyramid(m3Gaussian,m3Dog);return 1;}catch(...){return -1;}}
int m3_sift_initial(const unsigned char* gray,int w,int h){try{m3Initial=createInitialImage(Mat(h,w,CV_8U,const_cast<unsigned char*>(gray)),true,1.6f,false);return 1;}catch(...){return -1;}}
const float* m3_sift_initial_data(){return m3Initial.ptr<float>();}
int m3_sift_build(const float* base,int w,int h,int layers){try{m3Layers=layers;m3Gaussian.clear();m3Dog.clear();SIFT_Impl s(0,layers);s.buildGaussianPyramid(Mat(h,w,CV_32F,const_cast<float*>(base)),m3Gaussian,1);s.buildDoGPyramid(m3Gaussian,m3Dog);return 1;}catch(...){return -1;}}
const float* m3_sift_layer(int layer){return m3Gaussian.at(layer).ptr<float>();}
int m3_sift_detect(int x0,int y0,int width,int height,int cx,int cy,int cw,int ch,int octave,double contrast){
 try{m3SiftActive=true;m3SiftX=x0;m3SiftY=y0;m3SiftWidth=width;m3SiftHeight=height;m3SiftCoreX=cx;m3SiftCoreY=cy;m3SiftCoreW=cw;m3SiftCoreH=ch;m3SiftEscapes.clear();SIFT_Impl s(0,m3Layers,contrast);s.findScaleSpaceExtrema(m3Gaussian,m3Dog,m3Points);m3SiftActive=false;const float scale=float(1<<octave);for(auto& p:m3Points){p.pt*=scale;p.size*=scale;p.octave+=octave;}m3Pack();return m3Points.size();}catch(...){m3SiftActive=false;return -1;}
}
const int* m3_sift_escapes(){return m3SiftEscapes.data();}
int m3_sift_escape_count(){return m3SiftEscapes.size()/6;}
const float* m3_sift_points(){return m3Packed.data();}
int m3_sift_select(const float* points,int count,int limit,const unsigned char* mask,int width,int height,int maskScale){
 try{m3Points=m3Unpack(points,count);KeyPointsFilter::removeDuplicatedSorted(m3Points);if(limit>0)KeyPointsFilter::retainBest(m3Points,limit);for(auto& p:m3Points){p.octave=(p.octave&~255)|((p.octave-1)&255);p.pt*=.5f;p.size*=.5f;}if(mask){if(maskScale<=1)KeyPointsFilter::runByPixelsMask(m3Points,Mat(height,width,CV_8U,const_cast<unsigned char*>(mask)));else{size_t kept=0;for(const auto& p:m3Points)if(mask[(cvRound(p.pt.y)/maskScale)*width+cvRound(p.pt.x)/maskScale])m3Points[kept++]=p;m3Points.resize(kept);}}m3Total=m3Points.size();m3Pack();return m3Points.size();}catch(...){return -1;}
}
// Forgeryscope retains 4096 globally BEFORE its pixel-cell deduplication.
// Keep OpenCV ordering and the native topk tie behavior; descriptors still use
// the original coordinates/degrees, public coordinates/radians are converted later.
int m2_sift_forgeryscope_select(const float* points,int count,int width,int height){
 if(m3_sift_select(points,count,4096,nullptr,width,height,1)<0)return -1;
 try{
  const float radians=float(CV_PI/180.);std::map<int,std::pair<float,float>> best;
  std::vector<int> cells(m3Points.size()),keep;
  for(size_t i=0;i<m3Points.size();i++){
   const auto& p=m3Points[i];int x=int(std::nearbyint(p.pt.x-.5f)),y=int(std::nearbyint(p.pt.y-.5f));
   if(x<0||y<0||x>=width||y>=height)return -2;
   const int cell=y*width+x;cells[i]=cell;auto found=best.find(cell);
   const float angle=std::abs(p.angle*radians);
   if(found==best.end()||p.response>found->second.first)best[cell]={p.response,angle};
   else if(p.response==found->second.first)found->second.second=std::min(found->second.second,angle);
  }
  for(size_t i=0;i<m3Points.size();i++){const auto& p=m3Points[i];const auto v=best[cells[i]];if(p.response==v.first&&std::abs(p.angle*radians)==v.second)keep.push_back(i);}
  if(keep.size()>4096){auto cmp=[](int a,int b){return m3Points[a].response>m3Points[b].response;};if(4096*64<=keep.size())std::partial_sort(keep.begin(),keep.begin()+4096,keep.end(),cmp);else{std::nth_element(keep.begin(),keep.begin()+4095,keep.end(),cmp);std::sort(keep.begin(),keep.begin()+4095,cmp);}keep.resize(4096);}
  std::vector<KeyPoint> selected;selected.reserve(keep.size());for(int i:keep)selected.push_back(m3Points[i]);m3Points.swap(selected);m3Pack();return m3Points.size();
 }catch(...){return -1;}
}
int m3_sift_describe(const float* points,int count,int x0,int y0){
 try{const auto selected=m3Unpack(points,count);m3Descriptors.create(count,128,CV_32F);for(int i=0;i<count;i++){const auto& p=selected[i];int octave,layer;float scale;unpackOctave(p,octave,layer,scale);float angle=360.f-p.angle;if(std::abs(angle-360.f)<FLT_EPSILON)angle=0;Point2f pt(float(cvRound(p.pt.x*scale)-x0),float(cvRound(p.pt.y*scale)-y0));calcSIFTDescriptor(m3Gaussian[layer],pt,angle,p.size*scale*.5f,4,8,m3Descriptors,i);}return count;}catch(...){return -1;}
}
const float* m3_sift_descriptors(){return m3Descriptors.ptr<float>();}
void m3_sift_force_continuation(int enabled){m3SiftForce=enabled!=0;}
int m3_sift_neighborhood(int c,int r,int layer,float* out){try{for(int s=-1;s<=1;s++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)*out++=m3Dog.at(layer+s).at<float>(r+y,c+x);return 1;}catch(...){return -1;}}
// One original SIFT Newton step with globally addressed 3x3x3 DoG samples.
// 0=rejected,1=read the next global neighborhood,2=converged keypoint.
int m3_sift_refine(int* state,const float* dog,int width,int height,int nOctaveLayers,int octave,float contrastThreshold,float* output){
 const float img_scale=1.f/255,deriv_scale=img_scale*.5f,second_deriv_scale=img_scale,cross_deriv_scale=img_scale*.25f;
 const float* prev=dog,*img=dog+9,*next=dog+18;
 Vec3f dD((img[5]-img[3])*deriv_scale,(img[7]-img[1])*deriv_scale,(next[4]-prev[4])*deriv_scale);
 float v2=img[4]*2,dxx=(img[5]+img[3]-v2)*second_deriv_scale,dyy=(img[7]+img[1]-v2)*second_deriv_scale,dss=(next[4]+prev[4]-v2)*second_deriv_scale;
 float dxy=(img[8]-img[6]-img[2]+img[0])*cross_deriv_scale,dxs=(next[5]-next[3]-prev[5]+prev[3])*cross_deriv_scale,dys=(next[7]-next[1]-prev[7]+prev[1])*cross_deriv_scale;
 Matx33f H(dxx,dxy,dxs,dxy,dyy,dys,dxs,dys,dss);Vec3f X=H.solve(dD,DECOMP_LU);float xi=-X[2],xr=-X[1],xc=-X[0];
 if(!(std::abs(xi)<.5f&&std::abs(xr)<.5f&&std::abs(xc)<.5f)){
  if(std::abs(xi)>float(INT_MAX/3)||std::abs(xr)>float(INT_MAX/3)||std::abs(xc)>float(INT_MAX/3))return 0;
  state[0]+=cvRound(xc);state[1]+=cvRound(xr);state[2]+=cvRound(xi);state[3]++;
  if(state[3]>=5||state[2]<1||state[2]>nOctaveLayers||state[0]<5||state[0]>=width-5||state[1]<5||state[1]>=height-5)return 0;return 1;
 }
 Matx31f derivative((img[5]-img[3])*deriv_scale,(img[7]-img[1])*deriv_scale,(next[4]-prev[4])*deriv_scale);
 float t=derivative.dot(Matx31f(xc,xr,xi)),contr=img[4]*img_scale+t*.5f;if(std::abs(contr)*nOctaveLayers<contrastThreshold)return 0;
 v2=img[4]*2.f;dxx=(img[5]+img[3]-v2)*second_deriv_scale;dyy=(img[7]+img[1]-v2)*second_deriv_scale;dxy=(img[8]-img[6]-img[2]+img[0])*cross_deriv_scale;
 float tr=dxx+dyy,det=dxx*dyy-dxy*dxy;if(det<=0||tr*tr*10.f>=11.f*11.f*det)return 0;
 const float scale=float(1<<octave);output[0]=(state[0]+xc)*scale;output[1]=(state[1]+xr)*scale;output[2]=1.6f*powf(2.f,(state[2]+xi)/nOctaveLayers)*scale*2;output[3]=-1;output[4]=std::abs(contr);output[5]=float(octave+(state[2]<<8)+(cvRound((xi+.5)*255)<<16));output[6]=-1;return 2;
}
int m3_sift_finish_orientation(const float* point,int c,int r,int layer,int octave,int x0,int y0){try{
 KeyPoint kpt=m3Unpack(point,1)[0];float hist[36],scl=kpt.size*.5f/(1<<octave),omax=cpu_baseline::calcOrientationHist(m3Gaussian[layer],Point(c-x0,r-y0),cvRound(SIFT_ORI_RADIUS*scl),SIFT_ORI_SIG_FCTR*scl,hist,36),threshold=float(omax*SIFT_ORI_PEAK_RATIO);m3Points.clear();
 for(int j=0;j<36;j++){int l=j>0?j-1:35,r2=j<35?j+1:0;if(hist[j]>hist[l]&&hist[j]>hist[r2]&&hist[j]>=threshold){float bin=j+.5f*(hist[l]-hist[r2])/(hist[l]-2*hist[j]+hist[r2]);bin=bin<0?36+bin:bin>=36?bin-36:bin;kpt.angle=360.f-float((360.f/36)*bin);if(std::abs(kpt.angle-360.f)<FLT_EPSILON)kpt.angle=0;m3Points.push_back(kpt);}}m3Pack();return m3Points.size();
 }catch(...){return -1;}}
int m3_sift_reference(const unsigned char* gray,int width,int height,int limit,int layers,double contrast){try{m3SiftActive=false;auto sift=SIFT::create(limit,layers,contrast);sift->detectAndCompute(Mat(height,width,CV_8U,const_cast<unsigned char*>(gray)),noArray(),m3Points,m3Descriptors);m3Pack();return m3Points.size();}catch(...){return -1;}}
}
}

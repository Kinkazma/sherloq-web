// Included in the owned qualified AKAZE translation unit. Development study:
// native global configuration, locally evaluated finite-support evolution only.
void cloningAKAZEResizeRows(const cv::Mat&,cv::Mat&,int,int,int,int,int,int);
namespace cv {
static std::unique_ptr<AKAZEFeatures> m3Akaze,m3AkazeReference;
static std::vector<float> m3AkazeConfig;
static std::vector<Mat> m3AkazeOutput;
static std::vector<Mat> m3AkazeReferenceMasks;
static std::vector<float> m3AkazePoints,m3AkazeReferencePoints;
static Mat m3AkazeDescriptors,m3AkazeReferenceDescriptors;
static int m3AkazeSelectedTotal=0;
static void m3AkazePack(const std::vector<KeyPoint>& points,std::vector<float>& output){output.clear();for(const auto& p:points)output.insert(output.end(),{p.pt.x,p.pt.y,p.size,p.angle,p.response,float(p.octave),float(p.class_id)});}
static std::vector<KeyPoint> m3AkazeUnpack(const float* input,int count){std::vector<KeyPoint> points;for(int i=0;i<count;i++){const auto* p=input+i*7;points.emplace_back(p[0],p[1],p[2],p[3],p[4],int(p[5]),int(p[6]));}return points;}
extern "C" {
void m3_akaze_release(){m3AkazeOutput.clear();}
int m3_akaze_init(int width,int height){try{AKAZEOptions options;options.img_width=width;options.img_height=height;m3Akaze.reset(new AKAZEFeatures(options));m3AkazeConfig.clear();for(size_t i=0;i<m3Akaze->evolution_.size();i++){const auto& e=m3Akaze->evolution_[i];m3AkazeConfig.insert(m3AkazeConfig.end(),{float(e.size.width),float(e.size.height),e.esigma,e.etime,float(e.octave),float(e.sublevel),float(e.sigma_size),e.octave_ratio,float(e.border),float(i?m3Akaze->tsteps_[i-1].size():0)});}return m3Akaze->evolution_.size();}catch(...){return -1;}}
const float* m3_akaze_config(){return m3AkazeConfig.data();}
const float* m3_akaze_plane(int field){return m3AkazeOutput.at(field).ptr<float>();}
int m3_akaze_prepare(const unsigned char* gray,int width,int height){try{Mat image;Mat(height,width,CV_8U,const_cast<unsigned char*>(gray)).convertTo(image,CV_32F,1./255.);Mat initial,smooth,lx,ly,magnitude;
 cloningAKAZEGaussian(image,initial,Size(getGaussianKernelSize(1.6f),getGaussianKernelSize(1.6f)),1.6f,1.6f,BORDER_REPLICATE);
 cloningAKAZEGaussian(image,smooth,Size(5,5),1.,1.,BORDER_REPLICATE);cloningAKAZEScharr(smooth,lx,CV_32F,1,0,1,0,BORDER_DEFAULT);cloningAKAZEScharr(smooth,ly,CV_32F,0,1,1,0,BORDER_DEFAULT);
 magnitude.create(height,width,CV_32F);for(int i=0;i<width*height;i++){const float x=lx.ptr<float>()[i],y=ly.ptr<float>()[i];magnitude.ptr<float>()[i]=sqrtf(x*x+y*y);}m3AkazeOutput={initial,magnitude};return 1;}catch(...){return -1;}}
void m3_akaze_histogram(const float* values,int count,float maximum,int* histogram){const float scale=299.f/maximum;for(int i=0;i<count;i++)histogram[int(values[i]*scale)]++;}
float m3_akaze_contrast(const int* histogram,int count,float maximum){if(maximum==0)return .03f;const int threshold=int((count-histogram[0])*.7f);int n=0;for(int k=1;k<300;k++){if(n>=threshold)return maximum*k/300;n+=histogram[k];}return .03f;}
int m3_akaze_evolve(const float* base,int width,int height,int level,float contrast){try{
 MEvolution e=m3Akaze->evolution_.at(level);e.size=Size(width,height);e.Lt=Mat(height,width,CV_32F,const_cast<float*>(base)).clone();
 if(level){Mat lx,ly,flow,step;cloningAKAZEGaussian(e.Lt,e.Lsmooth,Size(5,5),1.,1.,BORDER_REPLICATE);cloningAKAZEScharr(e.Lsmooth,lx,CV_32F,1,0,1,0,BORDER_DEFAULT);cloningAKAZEScharr(e.Lsmooth,ly,CV_32F,0,1,1,0,BORDER_DEFAULT);compute_diffusivity(lx,ly,flow,contrast,KAZE::DIFF_PM_G2);
  for(const float tau:m3Akaze->tsteps_.at(level-1)){non_linear_diffusion_step(e.Lt,flow,step,tau*.5f);add(e.Lt,step,e.Lt);}
 }else e.Lsmooth=e.Lt;
 const Mat smooth=e.Lsmooth;Pyramid pyramid;pyramid.push_back(e);Compute_Determinant_Hessian_Response(pyramid);const auto& result=pyramid[0];m3AkazeOutput={result.Lt,smooth,result.Ldet,result.Lx,result.Ly};return 1;
 }catch(...){return -1;}}
int m3_akaze_resize(const float* source,int width,int height,int nextWidth,int nextHeight){try{Mat output;cloningAKAZEResize(Mat(height,width,CV_32F,const_cast<float*>(source)),output,Size(nextWidth,nextHeight),0,0,INTER_AREA);m3AkazeOutput={output};return 1;}catch(...){return -1;}}
int m3_akaze_resize_rows(const float* source,int width,int rows,int fullHeight,int sourceY,int nextWidth,int nextHeight,int targetY,int count){try{Mat output;cloningAKAZEResizeRows(Mat(rows,width,CV_32F,const_cast<float*>(source)),output,fullHeight,sourceY,nextWidth,nextHeight,targetY,count);m3AkazeOutput={output};return 1;}catch(...){return -1;}}
int m3_akaze_reference(const unsigned char* gray,int width,int height){try{AKAZEOptions options;options.img_width=width;options.img_height=height;m3AkazeReference.reset(new AKAZEFeatures(options));m3AkazeReference->Create_Nonlinear_Scale_Space(Mat(height,width,CV_8U,const_cast<unsigned char*>(gray)));return 1;}catch(...){return -1;}}
const float* m3_akaze_reference_plane(int level,int field){const auto& e=m3AkazeReference->evolution_.at(level);return (field==0?e.Lt:field==1?e.Ldet:field==2?e.Lx:e.Ly).ptr<float>();}
const float* m3_akaze_points(){return m3AkazePoints.data();}
int m3_akaze_reference_detect(){try{std::vector<KeyPoint> points;m3AkazeReference->Find_Scale_Space_Extrema(m3AkazeReferenceMasks);m3AkazeReference->Do_Subpixel_Refinement(m3AkazeReferenceMasks,points);m3AkazePack(points,m3AkazeReferencePoints);return points.size();}catch(...){return -1;}}
const float* m3_akaze_reference_points(){return m3AkazeReferencePoints.data();}
const unsigned char* m3_akaze_reference_mask(int level){return m3AkazeReferenceMasks.at(level).ptr<unsigned char>();}
// Full-width ordered strips carry the native same-scale mask frontier. Do not
// split them into independent detectors: a later candidate can erase an earlier one.
int m3_akaze_same(const float* determinant,unsigned char* mask,int width,int rows,int originY,int fullHeight,int level,int startY,int count){try{
 const auto& e=m3Akaze->evolution_.at(level);Mat kpts(rows,width,CV_8U,mask);const int radius=e.sigma_size;
 for(int gy=std::max(startY,e.border);gy<std::min(startY+count,fullHeight-e.border);gy++){
  const int y=gy-originY;CV_Assert(y>=radius&&y+radius<rows);const float *curr=determinant+y*width,*prev=curr-width,*next=curr+width;
  for(int x=e.border;x<width-e.border;x++){
   const float value=curr[x];if(value<=m3Akaze->options_.dthreshold||value<=curr[x-1]||value<=curr[x+1]||value<=prev[x-1]||value<=prev[x]||value<=prev[x+1]||value<=next[x-1]||value<=next[x]||value<=next[x+1])continue;
   int idx=0;if(find_neighbor_point(x,y,kpts,radius,idx)){if(value>determinant[idx])mask[idx]=0;else continue;}mask[y*width+x]=1;
  }
 }return 1;
 }catch(...){return -1;}}
// direction=-1 visits lower levels in ascending level order; +1 visits upper
// levels in descending order. Target mutations are written before the next strip.
int m3_akaze_cross(const float* determinant,const unsigned char* mask,int width,int rows,int originY,const float* targetDet,unsigned char* targetMask,int targetWidth,int targetRows,int targetY,int level,int direction,int startY,int count){try{
 const auto& e=m3Akaze->evolution_.at(level);const auto& target=m3Akaze->evolution_.at(level+direction);const int ratio=direction<0?int(e.octave_ratio)/int(target.octave_ratio):int(target.octave_ratio)/int(e.octave_ratio),radius=direction<0?e.sigma_size*ratio:target.sigma_size;Mat targetPoints(targetRows,targetWidth,CV_8U,targetMask);
 for(int gy=startY;gy<startY+count;gy++){const int y=gy-originY;CV_Assert(y>=0&&y<rows);for(int x=0;x<width;x++)if(mask[y*width+x]){
  const int px=direction<0?x*ratio:x/ratio,py=(direction<0?gy*ratio:gy/ratio)-targetY;CV_Assert(py>=radius&&py+radius<=targetRows&&px>=radius&&px+radius<=targetWidth);int idx=0;
  if(find_neighbor_point(px,py,targetPoints,radius,idx)&&determinant[y*width+x]>targetDet[idx])targetMask[idx]=0;
 }}return 1;
 }catch(...){return -1;}}
int m3_akaze_refine(const float* ldet,const unsigned char* mask,int width,int rows,int originY,int level,int startY,int count){try{
 const auto& e=m3Akaze->evolution_.at(level);std::vector<KeyPoint> points;const float ratio=e.octave_ratio;
 for(int gy=startY;gy<startY+count;gy++){const int y=gy-originY;for(int x=0;x<width;x++)if(mask[y*width+x]){
  CV_Assert(x>0&&x+1<width&&y>0&&y+1<rows);const int j=y*width+x;KeyPoint kp;kp.pt.x=x*ratio;kp.pt.y=gy*ratio;kp.size=e.esigma*m3Akaze->options_.derivative_factor;kp.angle=-1;kp.response=ldet[j];kp.octave=e.octave;kp.class_id=level;
  const float Dx=.5f*(ldet[j+1]-ldet[j-1]),Dy=.5f*(ldet[j+width]-ldet[j-width]);
  const float Dxx=ldet[j+1]+ldet[j-1]-2.f*ldet[j],Dyy=ldet[j+width]+ldet[j-width]-2.f*ldet[j],Dxy=.25f*(ldet[j+width+1]+ldet[j-width-1]-ldet[j-width+1]-ldet[j+width-1]);
  Matx22f A(Dxx,Dxy,Dxy,Dyy);Vec2f b(-Dx,-Dy),dst(0.f,0.f);solve(A,b,dst,DECOMP_LU);const float dx=dst(0),dy=dst(1);if(fabs(dx)>1.f||fabs(dy)>1.f)continue;
  kp.pt.x+=dx*ratio+.5f*(ratio-1.f);kp.pt.y+=dy*ratio+.5f*(ratio-1.f);kp.angle=0.;kp.size*=2.f;points.push_back(kp);
 }}m3AkazePack(points,m3AkazePoints);return points.size();
 }catch(...){return -1;}}
int m3_akaze_reference_describe(){try{auto points=m3AkazeUnpack(m3AkazeReferencePoints.data(),m3AkazeReferencePoints.size()/7);m3AkazeReference->Compute_Keypoints_Orientation(points);m3AkazeReference->Compute_Descriptors(points,m3AkazeReferenceDescriptors);m3AkazePack(points,m3AkazeReferencePoints);return points.size();}catch(...){return -1;}}
const unsigned char* m3_akaze_reference_descriptors(){return m3AkazeReferenceDescriptors.ptr<unsigned char>();}
const unsigned char* m3_akaze_descriptors(){return m3AkazeDescriptors.ptr<unsigned char>();}
int m3_akaze_describe(const float* lt,const float* lx,const float* ly,int width,int height,int originX,int originY,int level,const float* input,int count){
 struct Reset{MEvolution& e;~Reset(){e.Lt.release();e.Lx.release();e.Ly.release();m3AkazeOriginX=m3AkazeOriginY=0;}}reset{m3Akaze->evolution_.at(level)};
 try{auto& e=reset.e;e.Lt=Mat(height,width,CV_32F,const_cast<float*>(lt));e.Lx=Mat(height,width,CV_32F,const_cast<float*>(lx));e.Ly=Mat(height,width,CV_32F,const_cast<float*>(ly));m3AkazeOriginX=originX;m3AkazeOriginY=originY;auto points=m3AkazeUnpack(input,count);
  for(const auto& p:points){CV_Assert(p.class_id==level);const int scale=cvRound(.5f*p.size/e.octave_ratio),x=cvRound(p.pt.x/e.octave_ratio)-originX,y=cvRound(p.pt.y/e.octave_ratio)-originY,halo=cvCeil(10.f*sqrtf(2.f)*scale)+3;CV_Assert((originX==0||x>=halo)&&(originY==0||y>=halo)&&(originX+width==e.size.width||x+halo<width)&&(originY+height==e.size.height||y+halo<height));}
  m3Akaze->Compute_Keypoints_Orientation(points);m3Akaze->Compute_Descriptors(points,m3AkazeDescriptors);m3AkazePack(points,m3AkazePoints);return points.size();
 }catch(...){return -1;}}
int m3_akaze_gradients(const float* smooth,int width,int height,int level){try{const auto& e=m3Akaze->evolution_.at(level);Mat source(height,width,CV_32F,const_cast<float*>(smooth)),dxkx,dxky,dykx,dyky,lx,ly;compute_derivative_kernels(dxkx,dxky,1,0,e.sigma_size);compute_derivative_kernels(dykx,dyky,0,1,e.sigma_size);cloningAKAZESep(source,lx,CV_32F,dxkx,dxky);cloningAKAZESep(source,ly,CV_32F,dykx,dyky);m3AkazeOutput={lx,ly};return 1;}catch(...){return -1;}}
int m3_akaze_polygon(unsigned char* mask,int width,int height,const int* xy,int count,int value){try{Mat mat(height,width,CV_8U,mask);std::vector<Point> polygon;for(int i=0;i<count;i++)polygon.emplace_back(xy[i*2],xy[i*2+1]);fillPoly(mat,std::vector<std::vector<Point>>{polygon},Scalar(value));return 1;}catch(...){return -1;}}
int m3_akaze_select(const float* input,int count,const unsigned char* mask,int width,int height,int limit,int rank){try{
 auto points=m3AkazeUnpack(input,count);if(mask)KeyPointsFilter::runByPixelsMask(points,Mat(height,width,CV_8U,const_cast<unsigned char*>(mask)));m3AkazeSelectedTotal=points.size();
 if(rank){std::vector<int> ids(points.size());std::iota(ids.begin(),ids.end(),0);const int retained=std::min(int(points.size()),limit);std::partial_sort(ids.begin(),ids.begin()+retained,ids.end(),[&](int a,int b){return points[a].response!=points[b].response?points[a].response>points[b].response:a<b;});std::vector<KeyPoint> selected;for(int i=0;i<retained;i++)selected.push_back(points[ids[i]]);points=std::move(selected);}
 m3AkazePack(points,m3AkazePoints);return points.size();
 }catch(...){return -1;}}
int m3_akaze_selected_total(){return m3AkazeSelectedTotal;}
}
}

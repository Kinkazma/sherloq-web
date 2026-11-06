// The pinned native SSIMULACRA helper uses Carotene's float reciprocal path.
static cv::Scalar comparisonMean32(const cv::Mat& input){
 const int planes=input.isContinuous()?1:input.rows,length=input.isContinuous()?int(input.total()):input.cols;double sum=0;
 for(int y=0;y<planes;y++){
  const float* p=input.ptr<float>(y);double lanes[4]={0,0,0,0};int i=0;
  for(;i<=length-8;i+=8)for(int k=0;k<4;k++)lanes[k]+=double(p[i+k])+double(p[i+k+4]);
  for(double lane:lanes)sum+=lane;
  for(;i<=length-4;i+=4)sum+=((p[i]+p[i+1])+p[i+2])+p[i+3];
  for(;i<length;i++)sum+=p[i];
 }return cv::Scalar(sum*(1./double(input.total())));
}
static void comparisonAreaHalf(const cv::Mat& input,cv::Mat& output){
 cv::Mat result;cv::resize(input,result,{},.5,.5,cv::INTER_AREA);
 const int prefix=std::min(result.cols,input.cols/2)/4*4;
 for(int y=0;y<result.rows&&2*y+1<input.rows;y++)for(int x=0;x<prefix;x++){
  const float* top=input.ptr<float>(2*y),*bottom=input.ptr<float>(2*y+1);
  result.at<float>(y,x)=((top[2*x]+top[2*x+1])+(bottom[2*x]+bottom[2*x+1]))*.25f;
 }output=result;
}
static cv::Mat comparisonDivide(const cv::Mat& numerator,const cv::Mat& denominator){
 cv::Mat result(numerator.size(),CV_32F);const size_t n=result.total(),vectorEnd=n/2*2;
 for(size_t i=0;i<n;i++){
  float a=numerator.ptr<float>()[i],b=denominator.ptr<float>()[i];
  if(i<vectorEnd&&b!=0&&std::isfinite(b)){
   float inverse=estimateReference(std::abs(b),false);inverse=std::copysign(inverse,b);
   for(int k=0;k<2;k++)inverse=sherloq_stereo_fma(-b,inverse,2.f)*inverse;
   result.ptr<float>()[i]=a*inverse;
  }else result.ptr<float>()[i]=a/b;
 }return result;
}

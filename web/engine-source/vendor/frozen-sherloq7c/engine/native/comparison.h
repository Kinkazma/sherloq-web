// Native comparison uses float64 grayscale, with independent display maps.
static double comparisonScore=0;
static cv::Mat comparisonGaussian(const cv::Mat& input){
 const int w=input.cols,h=input.rows;const auto weights=cv::getGaussianKernel(11,1.5,CV_64F);const double* k=weights.ptr<double>();cv::Mat horizontal(input.size(),CV_64F),result(input.size(),CV_64F);
 if(w==1)input.copyTo(horizontal);else{
  cv::Mat padded;cv::copyMakeBorder(input,padded,0,0,5,5,cv::BORDER_REFLECT_101);
  for(int y=0;y<h;y++){const double* src=padded.ptr<double>(y);double* dst=horizontal.ptr<double>(y);for(int x=0;x<w;x++){double sum=src[x]*k[0];for(int j=1;j<11;j++)sum=std::fma(src[x+j],k[j],sum);dst[x]=sum;}}
 }
 if(h==1)return horizontal;
 for(int y=0;y<h;y++){double* dst=result.ptr<double>(y);const double* center=horizontal.ptr<double>(y);for(int x=0;x<w;x++)dst[x]=center[x]*k[5];for(int j=1;j<=5;j++){const double* above=horizontal.ptr<double>(cv::borderInterpolate(y-j,h,cv::BORDER_REFLECT_101)),*below=horizontal.ptr<double>(cv::borderInterpolate(y+j,h,cv::BORDER_REFLECT_101));for(int x=0;x<w;x++)dst[x]=std::fma(above[x]+below[x],k[5+j],dst[x]);}}
 return result;
}
static cv::Mat comparisonSsim(const cv::Mat& first,const cv::Mat& second){
 cv::Mat x,y;cv::cvtColor(first,x,cv::COLOR_BGR2GRAY);cv::cvtColor(second,y,cv::COLOR_BGR2GRAY);x.convertTo(x,CV_64F);y.convertTo(y,CV_64F);
 auto ux=comparisonGaussian(x),uy=comparisonGaussian(y),vx=comparisonGaussian(x.mul(x)),vy=comparisonGaussian(y.mul(y)),cov=comparisonGaussian(x.mul(y));cv::Mat result(x.size(),CV_64F);
 for(int i=0;i<x.total();i++){double a=ux.ptr<double>()[i],b=uy.ptr<double>()[i],a2=a*a,b2=b*b,ab=a*b,va=vx.ptr<double>()[i]-a2,vb=vy.ptr<double>()[i]-b2,c=cov.ptr<double>()[i]-ab;result.ptr<double>()[i]=((2*ab+6.5025)*(2*c+58.5225))/((a2+b2+6.5025)*(va+vb+58.5225));}
 comparisonScore=cv::mean(result)[0];return result;
}
static cv::Mat comparisonHistograms(const cv::Mat& first,const cv::Mat& second){
 int channels[]={0,1,2},sizes[]={256,256,256};float range[]={0,256};const float* ranges[]={range,range,range};cv::Mat a,b,result(1,8,CV_64F);const int methods[]={0,1,4,2,3,5};
 cv::calcHist(&first,1,channels,{},a,3,sizes,ranges);cv::calcHist(&second,1,channels,{},b,3,sizes,ranges);double maxA,maxB;cv::minMaxIdx(a,nullptr,&maxA);cv::minMaxIdx(b,nullptr,&maxB);
 if(std::max(maxA,maxB)<16777216){
  // NumPy's 256x256x256 histograms re-enter Python's OpenCV binding as
  // 256-channel 256x256 Mats. Preserve that historical correlation divisor.
  cv::Mat pythonA(256,256,CV_MAKETYPE(CV_32F,256),a.data),pythonB(256,256,CV_MAKETYPE(CV_32F,256),b.data);
  result.at<double>(6)=cv::compareHist(a,b,0);result.at<double>(7)=65536;
  for(int i=0;i<6;i++)result.at<double>(i)=cv::compareHist(pythonA,pythonB,methods[i]);
  double sums[2]={0,0},sa=0,sb=0;const float* av=a.ptr<float>(),*bv=b.ptr<float>();
  for(int i=0;i<(1<<24);i++){double x=av[i],y=bv[i];sums[i%2]+=std::sqrt(x*y);sa+=x;sb+=y;}
  double inverse=std::abs(sa*sb)>FLT_EPSILON?1./std::sqrt(sa*sb):1.;result.at<double>(4)=std::sqrt(std::max(std::fma(-(sums[0]+sums[1]),inverse,1.),0.));
  return result;
 }
 // Float32 histogram increments saturate above 2^24; retain native correction.
 a.release();b.release();std::vector<uint64_t> ca(1<<24),cb(1<<24);for(int i=0;i<first.total();i++){const uchar* p=first.ptr<uchar>()+i*3,*q=second.ptr<uchar>()+i*3;ca[(p[0]<<16)|(p[1]<<8)|p[2]]++;cb[(q[0]<<16)|(q[1]<<8)|q[2]]++;}
 std::vector<double> av,bv;for(int i=0;i<(1<<24);i++)if(ca[i]||cb[i]){av.push_back(double(ca[i]));bv.push_back(double(cb[i]));}
 double sa=contrastSum(av.data(),av.size()),sb=contrastSum(bv.data(),bv.size()),aa=0,bb=0,ab=0;std::vector<double> chi,alt,intersection,bhat,kl;
 for(int i=0;i<av.size();i++){double x=av[i],y=bv[i],d=x-y;aa+=x*x;bb+=y*y;ab+=x*y;if(x>0){chi.push_back(d*d/x);kl.push_back(x*std::log(x/(y>0?y:1e-10)));}alt.push_back(d*d/(x+y));intersection.push_back(std::min(x,y));bhat.push_back(std::sqrt(x*y));}
 double denominator=(aa-sa*sa/(1<<24))*(bb-sb*sb/(1<<24));result.at<double>(0)=denominator>0?(ab-sa*sb/(1<<24))/std::sqrt(denominator):1.;result.at<double>(1)=contrastSum(chi.data(),chi.size());result.at<double>(2)=2*contrastSum(alt.data(),alt.size());result.at<double>(3)=contrastSum(intersection.data(),intersection.size());result.at<double>(4)=std::sqrt(std::max(1.-contrastSum(bhat.data(),bhat.size())/std::sqrt(sa*sb),0.));result.at<double>(5)=contrastSum(kl.data(),kl.size());result.at<double>(6)=result.at<double>(0);result.at<double>(7)=1<<24;return result;
}

extern "C" int sherloq_prnu_correlate_fft(const double*,double*,int,int);
static bool prnuFftMethod=false;
static double prnuNoisePower=0;
static cv::Mat prnuCorrelation(const cv::Mat& input){
 cv::Mat out(input.size(),CV_64F);
 if(prnuFftMethod){if(!sherloq_prnu_correlate_fft(input.ptr<double>(),out.ptr<double>(),input.cols,input.rows))throw std::runtime_error("PRNU FFT failed");return out;}
 for(int y=0;y<input.rows;y++)for(int x=0;x<input.cols;x++){
  double sum=0;for(int ky=-1;ky<=1;ky++)for(int kx=-1;kx<=1;kx++){int row=y+ky,col=x+kx;sum+=row>=0&&row<input.rows&&col>=0&&col<input.cols?input.at<double>(row,col):0.;}out.at<double>(y,x)=sum;
 }return out;
}
static cv::Mat prnuResidual(const cv::Mat& rgb){
 if(std::min(rgb.rows,rgb.cols)<3)throw std::runtime_error("PRNU requires at least 3 x 3 pixels");
 cv::Mat gray,input;cv::cvtColor(rgb,gray,cv::COLOR_RGB2GRAY);gray.convertTo(input,CV_64F);for(size_t i=0;i<input.total();i++)input.ptr<double>()[i]/=255.;
 const double full=double(rgb.rows+2)*(rgb.cols+2),fftOps=3*full*std::log(full),directOps=double(rgb.rows)*rgb.cols*9;
 prnuFftMethod=2.04735e-9*fftOps<1.55367e-8*directOps-1e-4;
 cv::Mat mean=prnuCorrelation(input),variance=prnuCorrelation(input.mul(input));
 for(size_t i=0;i<input.total();i++){double m=mean.ptr<double>()[i]/9.;mean.ptr<double>()[i]=m;variance.ptr<double>()[i]=variance.ptr<double>()[i]/9.-m*m;}
 double noise=0;for(size_t start=0;start<variance.total();start+=8192)noise+=contrastSum(variance.ptr<double>()+start,std::min(size_t(8192),variance.total()-start));noise/=double(variance.total());prnuNoisePower=noise;cv::Mat out(rgb.rows-2,rgb.cols-2,CV_64F);
 for(int y=1;y<rgb.rows-1;y++)for(int x=1;x<rgb.cols-1;x++){
  double v=variance.at<double>(y,x),m=mean.at<double>(y,x),original=input.at<double>(y,x),filtered=v<noise?m:(original-m)*(1-noise/v)+m,residual=original-filtered;out.at<double>(y-1,x-1)=std::isfinite(residual)?residual:0.;
 }return out;
}

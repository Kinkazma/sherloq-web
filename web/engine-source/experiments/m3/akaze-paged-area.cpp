// Preserve the qualified global INTER_AREA phase, grouping and scalar tail.
#include "../cloning/akaze-area.cpp"
void cloningAKAZEResizeRows(const cv::Mat& source,cv::Mat& output,int fullHeight,int sourceY,int targetWidth,int targetHeight,int targetY,int count){
 using namespace cv;
 output.create(count,targetWidth,CV_32F);
 const double sx=1./(double(targetWidth)/source.cols),sy=1./(double(targetHeight)/fullHeight);
 if(sx==2.&&sy==2.){
  for(int y=0;y<count;y++)for(int x=0;x<targetWidth;x++){
   const int yy=2*(y+targetY)-sourceY;CV_Assert(yy>=0&&yy+1<source.rows);
   const float a=source.at<float>(yy,2*x),b=source.at<float>(yy,2*x+1),c=source.at<float>(yy+1,2*x),d=source.at<float>(yy+1,2*x+1);
   output.at<float>(y,x)=(x<targetWidth/4*4?(a+b)+(c+d):((a+b)+c)+d)*.25f;
  }return;
 }
 const auto xt=akazeAreaCoefficients(source.cols,targetWidth,sx),yt=akazeAreaCoefficients(fullHeight,targetHeight,sy);
 std::vector<float> row(targetWidth),sum(targetWidth,0);int previous=-1;
 auto finish=[&](){if(previous>=0)for(int x=0;x<targetWidth;x++)output.at<float>(previous-targetY,x)=sum[x];};
 for(const auto& y:yt){
  if(y.dest<targetY||y.dest>=targetY+count)continue;
  CV_Assert(y.source>=sourceY&&y.source<sourceY+source.rows);
  std::fill(row.begin(),row.end(),0);const auto* input=source.ptr<float>(y.source-sourceY);
  for(const auto& x:xt)row[x.dest]=std::fma(float(input[x.source]),x.weight,row[x.dest]);
  if(y.dest!=previous){finish();if(y.dest==0){for(int x=0;x<targetWidth;x++)sum[x]=x>=(targetWidth-1)/4*4?std::fma(y.weight,row[x],0.f):0.f+y.weight*row[x];}else for(int x=0;x<targetWidth;x++)sum[x]=y.weight*row[x];previous=y.dest;}
  else for(int x=0;x<targetWidth;x++)sum[x]=x>=(targetWidth-1)/4*4?std::fma(y.weight,row[x],sum[x]):sum[x]+y.weight*row[x];
 }finish();
}

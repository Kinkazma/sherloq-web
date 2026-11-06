// Corrected IPOL Noisesniffer statistics; RGB float64, no color transform.
extern "C" int sherloq_noisesniffer_dct(double*,size_t,size_t);
extern "C" void cv_prnu_fma_mode(int);
extern "C" double sherloq_prnu_fma64(double,double,double);
extern "C" int cv_noisesniffer_statistics(const unsigned char* rgb,int width,int height,int w,unsigned char* valid,double* means,float* variance,int part,int fast){
 try{
  if((w!=3&&w!=5&&w!=7&&w!=8)||width<w||height<w)return 0;
  const int rows=height-w+1,cols=width-w+1;const size_t n=size_t(rows)*cols;
  if(part<0||part>2)return 0;cv_prnu_fma_mode(fast);
  const double coefficient=1./double(w*w);
  if(part!=2){
  // OpenCV switches this 8x8 float64 kernel to its DFT filter. Its rounding
  // is part of the native mean ordering, including mathematical equalities.
  if(w==8){
   cv::Mat input(height,width,CV_8UC3,const_cast<unsigned char*>(rgb)),floating,mean;
   input.convertTo(floating,CV_64F);cv::filter2D(floating,mean,-1,cv::Mat(w,w,CV_64F,cv::Scalar(coefficient)));
   for(int y=0;y<rows;y++)std::copy_n(mean.ptr<double>(y+w/2)+(w/2)*3,cols*3,means+size_t(y)*cols*3);
  }else for(int y=0;y<rows;y++)for(int x=0;x<cols;x++)for(int c=0;c<3;c++){
   double sum=0;for(int dy=0;dy<w;dy++)for(int dx=0;dx<w;dx++){double v=rgb[(size_t(y+dy)*width+x+dx)*3+c];sum=fast?sherloq_prnu_fma64(coefficient,v,sum):std::fma(coefficient,v,sum);}
   means[(size_t(y)*cols+x)*3+c]=sum;
  }
  int lo[3]={255,255,255},hi[3]={0,0,0};
  for(size_t i=0;i<size_t(width)*height;i++)for(int c=0;c<3;c++){lo[c]=std::min(lo[c],int(rgb[3*i+c]));hi[c]=std::max(hi[c],int(rgb[3*i+c]));}
  std::vector<int> integral(size_t(height+1)*(width+1),0);
  for(int y=0;y<height;y++){int sum=0;for(int x=0;x<width;x++){bool ok=true;for(int c=0;c<3;c++){int v=rgb[(size_t(y)*width+x)*3+c];ok&=v>lo[c]&&v<hi[c];}sum+=ok;integral[size_t(y+1)*(width+1)+x+1]=sum+integral[size_t(y)*(width+1)+x+1];}}
  for(int y=0;y<rows;y++)for(int x=0;x<cols;x++)valid[size_t(y)*cols+x]=(integral[size_t(y+w)*(width+1)+x+w]-integral[size_t(y)*(width+1)+x+w]-integral[size_t(y+w)*(width+1)+x]+integral[size_t(y)*(width+1)+x])==w*w;
  }if(part==1)return 1;
  const int batchRows=std::max(1,32768/cols),T=w==3?3:w==5?5:w==7?8:9;
  std::vector<double> blocks(size_t(std::min(rows,batchRows))*cols*w*w);float squares[64];
  for(int c=0;c<3;c++)for(int row=0;row<rows;row+=batchRows){
   const int end=std::min(rows,row+batchRows);const size_t count=size_t(end-row)*cols;
   for(int y=row;y<end;y++)for(int x=0;x<cols;x++)for(int dy=0;dy<w;dy++)for(int dx=0;dx<w;dx++)blocks[((size_t(y-row)*cols+x)*w+dy)*w+dx]=rgb[(size_t(y+dy)*width+x+dx)*3+c];
   if(!sherloq_noisesniffer_dct(blocks.data(),count,w))return 0;
   for(size_t i=0;i<count;i++){for(int y=0;y<w;y++)for(int x=0;x<w;x++){float f=float(blocks[(i*w+y)*w+x]);f*=float(y+x!=0&&y+x<T);squares[y*w+x]=f*f;}variance[size_t(c)*n+size_t(row)*cols+i]=contrastSum(squares,size_t(w*w));}
  }return 1;
 }catch(...){return 0;}
}

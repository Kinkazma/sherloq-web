// Global streaming primitives. Original GRIP-UNINA Splicebuster licence applies.
// Chunking never changes the population or fits an independent model per tile.
#include "statistics.cpp"

extern "C" {
EMSCRIPTEN_KEEPALIVE int sb_indices(int count,unsigned int seed,int reps,unsigned int* indices){
 if(count<1||reps<1)return 1;
 std::mt19937 mt(seed);uint32_t maximum=count-1,mask=maximum;
 mask|=mask>>1;mask|=mask>>2;mask|=mask>>4;mask|=mask>>8;mask|=mask>>16;
 for(int r=0;r<reps;r++){uint32_t value;do{value=mt()&mask;}while(value>maximum);indices[r]=value;}
 return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_feature_sums(const float* spam,const unsigned char* valid,int n,int f,double* sums,int* count){
 if(n<0||f<1)return 1;
 int rows=0;for(int i=0;i<n;i++)rows+=!!valid[i];*count=rows;
 Eigen::Map<Vec>(sums,f).setZero();if(!rows)return 0;
 Mat samples(rows,f);int r=0;
 for(int i=0;i<n;i++)if(valid[i]){for(int j=0;j<f;j++)samples(r,j)=static_cast<double>(std::sqrt(spam[(size_t)i*f+j]));r++;}
 Eigen::Map<Vec>(sums,f)=samples.colwise().sum().transpose();return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_feature_covariance(const float* spam,const unsigned char* valid,int n,int f,const double* mean,double* cov,int* count){
 if(n<0||f<1)return 1;
 int rows=0;for(int i=0;i<n;i++)rows+=!!valid[i];*count=rows;
 OutMap(cov,f,f).setZero();if(!rows)return 0;
 Mat samples(rows,f);int r=0;
 for(int i=0;i<n;i++)if(valid[i]){for(int j=0;j<f;j++)samples(r,j)=static_cast<double>(std::sqrt(spam[(size_t)i*f+j]))-mean[j];r++;}
 OutMap(cov,f,f).noalias()=samples.transpose()*samples;return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_basis(const double* covSum,double count,int f,int d,double* output){
 if(!(count>0)||!std::isfinite(count)||f<1||d<1||d>f)return 1;
 Mat cov=Map(covSum,f,f)/count;Eigen::SelfAdjointEigenSolver<Mat> es(cov);
 if(es.info()!=Eigen::Success)return 3;
 OutMap basis(output,f,d);
 for(int j=0;j<d;j++){double v=es.eigenvalues()(f-1-j);if(!(v>0)||!std::isfinite(v))return 4;basis.col(j)=es.eigenvectors().col(f-1-j)/std::sqrt(v);}
 return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_project(const float* spam,const unsigned char* valid,int n,int f,int d,const double* basis,double* projected,double* training,int* count){
 if(n<0||f<1||d<1)return 1;
 const Map l(basis,f,d);int rows=0;constexpr int block=256;
 for(int start=0;start<n;start+=block){
  int take=std::min(block,n-start);Mat x(take,f);
  for(int i=0;i<take;i++)for(int j=0;j<f;j++)x(i,j)=static_cast<double>(std::sqrt(spam[(size_t)(start+i)*f+j]));
  OutMap(projected+(size_t)start*d,take,d).noalias()=x*l;
 }
 for(int i=0;i<n;i++)if(valid[i]){for(int j=0;j<d;j++)training[(size_t)rows*d+j]=projected[(size_t)i*d+j];rows++;}
 *count=rows;return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_training_sums(const double* training,int n,int d,double* sums){
 if(n<0||d<1)return 1;
 Eigen::Map<Vec>(sums,d).setZero();if(n)Eigen::Map<Vec>(sums,d)=Map(training,n,d).colwise().sum().transpose();return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_training_variance(const double* training,int n,int d,const double* mean,double* varianceSum){
 if(n<0||d<1)return 1;
 Eigen::Map<Vec>(varianceSum,d).setZero();if(!n)return 0;
 Mat centered=Map(training,n,d).rowwise()-Eigen::Map<const Vec>(mean,d).transpose();
 Eigen::Map<Vec>(varianceSum,d)=centered.array().square().colwise().sum().transpose();return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_initial_model(const double* initialSample,const double* variance,int d,double* mu,double* sigma,double* info){
 if(d<1)return 1;
 Eigen::Map<Vec>(mu,2*d).setZero();for(int j=0;j<d;j++)mu[j]=initialSample[j];
 OutMap(sigma,d,d).setZero();double reg=spacing(*std::max_element(variance,variance+d));
 for(int j=0;j<d;j++)sigma[(size_t)j*d+j]=variance[j]+reg;
 info[0]=.99;info[1]=.01;return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_expect_chunk(const double* training,int n,int d,const double* mu,const double* sigma,double priorProb,double outProb,double uniformNlogl,double* posterior,double* moments){
 if(n<0||d<1)return 1;
 Eigen::Map<Vec>(moments,3+2*d).setZero();if(!n)return 0;
 const Map x(training,n,d),s(sigma,d,d);const Eigen::Map<const Vec> m(mu,d);
 Vec mahal;double logdet;if(!distances(x,m,s,mahal,logdet))return 5;
 const double c=d*std::log(2*3.141592653589793238462643383279502884);
 const double logPrior=std::log(priorProb),logUniform=std::log(outProb)-uniformNlogl;
 double logSum=0;
 for(int i=0;i<n;i++){
  double a=logPrior-.5*(mahal(i)+logdet+c),maximum=std::max(a,logUniform);
  double p=std::exp(a-maximum),q=std::exp(logUniform-maximum),den=p+q;
  posterior[2*(size_t)i]=p/den;posterior[2*(size_t)i+1]=q/den;
  logSum+=std::log(den)+maximum;
 }
 const Map post(posterior,n,2);moments[0]=post.col(0).sum();moments[1]=post.col(1).sum();moments[2]=logSum;
 Eigen::Map<Vec>(moments+3,d).noalias()=x.transpose()*post.col(0);
 Eigen::Map<Vec>(moments+3+d,d).noalias()=x.transpose()*post.col(1);
 return std::isfinite(logSum)?0:8;
}
EMSCRIPTEN_KEEPALIVE int sb_covariance_chunk(const double* training,const double* posterior,int n,int d,const double* mean,double* covarianceSum){
 if(n<0||d<1)return 1;
 OutMap(covarianceSum,d,d).setZero();if(!n)return 0;
 Mat centered=Map(training,n,d).rowwise()-Eigen::Map<const Vec>(mean,d).transpose();
 Vec root=Map(posterior,n,2).col(0).array().sqrt();centered.array().colwise()*=root.array();
 OutMap(covarianceSum,d,d).noalias()=centered.transpose()*centered;return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_model_update(const double* covarianceSum,int d,double inCount,double outCount,double* sigma,double* info){
 if(d<1||!(inCount>0)||!(outCount>=0))return 1;
 Mat cov=Map(covarianceSum,d,d)/inCount;
 Eigen::SelfAdjointEigenSolver<Mat> es(cov,Eigen::EigenvaluesOnly);if(es.info()!=Eigen::Success)return 7;
 cov.diagonal().array()+=std::abs(spacing(es.eigenvalues().maxCoeff()));OutMap(sigma,d,d)=cov;
 const double den=inCount+outCount;info[0]=inCount/den;info[1]=outCount/den;return 0;
}
EMSCRIPTEN_KEEPALIVE int sb_factor(const double* sigma,int d,double* output,double* logdet){
 if(d<1)return 1;Mat lower;if(!factor(Map(sigma,d,d),lower))return 5;
 OutMap(output,d,d)=lower;*logdet=2*lower.diagonal().array().log().sum();return 0;
}
}

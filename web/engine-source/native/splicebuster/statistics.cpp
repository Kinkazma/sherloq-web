// Splicebuster Gaussian/Uniform statistics, private CPU research backend.
// Based on D. Cozzolino, G. Poggi, L. Verdoliva, IEEE WIFS 2015.
// Original method software: Copyright (c) 2018 GRIP-UNINA, nonprofit use only.
// The accompanying LICENSE.txt applies. No scientific regularization is added.
#include <Eigen/Core>
#include <Eigen/Cholesky>
#include <Eigen/Eigenvalues>
#include <cmath>
#include <cstdint>
#include <limits>
#include <random>
#include <algorithm>
#include <emscripten/emscripten.h>

using Mat = Eigen::Matrix<double,Eigen::Dynamic,Eigen::Dynamic,Eigen::RowMajor>;
using ColMat = Eigen::MatrixXd;
using Vec = Eigen::VectorXd;
using Map = Eigen::Map<const Mat>;
using OutMap = Eigen::Map<Mat>;

static double spacing(double value) {
  return std::nextafter(value,std::numeric_limits<double>::infinity())-value;
}

static bool factor(const Mat& sigma, Mat& lower) {
  Eigen::LLT<Mat> llt(sigma);
  if(llt.info()==Eigen::Success){lower=llt.matrixL();return true;}
  Mat repaired=sigma;
  for(int attempt=0;attempt<2;attempt++) {
    Eigen::SelfAdjointEigenSolver<Mat> es(repaired);
    if(es.info()!=Eigen::Success)return false;
    Vec values=es.eigenvalues().cwiseMax(spacing(es.eigenvalues().maxCoeff()));
    repaired=es.eigenvectors()*values.asDiagonal()*es.eigenvectors().transpose();
    llt.compute(repaired);
    if(llt.info()==Eigen::Success){lower=llt.matrixL();return true;}
  }
  return false;
}

static bool distances(const Map& x,const Vec& mu,const Mat& sigma,Vec& mahal,double& logdet) {
  Mat lower;
  if(!factor(sigma,lower))return false;
  logdet=2*lower.diagonal().array().log().sum();
  ColMat z=x.transpose();z.colwise()-=mu;
  lower.triangularView<Eigen::Lower>().solveInPlace(z);
  mahal=z.colwise().squaredNorm().transpose();
  return mahal.allFinite()&&std::isfinite(logdet);
}

static bool expectation(const Map& x,const Vec& mu,const Mat& sigma,double priorProb,double outProb,double uniformNlogl,
                        Vec& inlier,Vec& outlier,double& score) {
  Vec mahal;double logdet;
  if(!distances(x,mu,sigma,mahal,logdet))return false;
  const double c=x.cols()*std::log(2*3.141592653589793238462643383279502884);
  const double logPrior=std::log(priorProb), logUniform=std::log(outProb)-uniformNlogl;
  inlier.resize(x.rows());outlier.resize(x.rows());score=0;
  // Each row has only Gaussian and Uniform logits, the original two-way softmax.
  for(int i=0;i<x.rows();i++){
    double a=logPrior-.5*(mahal(i)+logdet+c),m=std::max(a,logUniform);
    double p=std::exp(a-m),q=std::exp(logUniform-m),den=p+q;
    inlier(i)=p/den;outlier(i)=q/den;score+=std::log(den)+m;
  }
  score/=x.rows();return std::isfinite(score);
}

extern "C" {
EMSCRIPTEN_KEEPALIVE int sb_prepare(const float* spam,const unsigned char* valid,int n,int f,int d,
 unsigned int seed,int reps,double* projected,double* training,double* basis,double* variance,
 unsigned int* initialIndices,int* outputNValid) {
  if(n<1||f<1||d<1||d>f||reps<1)return 1;
  int count=0;for(int i=0;i<n;i++)count+=!!valid[i];
  *outputNValid=count;if(!count)return 2;
  Mat samples(count,f);int row=0;
  for(int i=0;i<n;i++)if(valid[i]){
    for(int j=0;j<f;j++)samples(row,j)=static_cast<double>(std::sqrt(spam[(size_t)i*f+j]));
    row++;
  }
  Vec mean=samples.colwise().mean().transpose();
  samples.rowwise()-=mean.transpose();
  Mat cov=samples.transpose()*samples/count;
  Mat().swap(samples); // release sample workspace before projection/variance passes
  Eigen::SelfAdjointEigenSolver<Mat> es(cov);
  if(es.info()!=Eigen::Success)return 3;
  Mat l(f,d);
  for(int j=0;j<d;j++){
    double value=es.eigenvalues()(f-1-j);
    if(!(value>0)||!std::isfinite(value))return 4;
    l.col(j)=es.eigenvectors().col(f-1-j)/std::sqrt(value);
  }
  OutMap(basis,f,d)=l;
  // Projection is global. A bounded row block avoids materializing n*f doubles.
  constexpr int block=256;
  for(int start=0;start<n;start+=block){
    const int rows=std::min(block,n-start);Mat sqrtBlock(rows,f);
    for(int i=0;i<rows;i++)for(int j=0;j<f;j++)
      sqrtBlock(i,j)=static_cast<double>(std::sqrt(spam[(size_t)(start+i)*f+j]));
    OutMap(projected+(size_t)start*d,rows,d).noalias()=sqrtBlock*l;
  }
  row=0;for(int i=0;i<n;i++)if(valid[i]){
    for(int j=0;j<d;j++)training[(size_t)row*d+j]=projected[(size_t)i*d+j];row++;
  }
  Map train(training,count,d);Vec m=train.colwise().mean().transpose();
  Mat centered=train.rowwise()-m.transpose();
  Vec var=centered.array().square().colwise().mean().transpose();
  for(int j=0;j<d;j++)variance[j]=var(j);
  // RandomState(seed).random_integers(0,nValid-1), legacy rk_interval rejection.
  std::mt19937 mt(seed);uint32_t maximum=count-1,mask=maximum;
  mask|=mask>>1;mask|=mask>>2;mask|=mask>>4;mask|=mask>>8;mask|=mask>>16;
  for(int r=0;r<reps;r++){uint32_t value;do{value=mt()&mask;}while(value>maximum);initialIndices[r]=value;}
  return 0;
}

EMSCRIPTEN_KEEPALIVE int sb_fit(const double* training,int n,int d,int initialIndex,const double* variance,
 int maxIter,double relErr,double uniformNlogl,double* outputMu,double* outputSigma,double* outputInfo) {
  if(n<1||d<1||initialIndex<0||initialIndex>=n||maxIter<1)return 1;
  Map x(training,n,d);Vec mu=x.row(initialIndex).transpose();
  double high=*std::max_element(variance,variance+d),reg=spacing(high);
  Mat sigma=Mat::Zero(d,d);for(int j=0;j<d;j++)sigma(j,j)=variance[j]+reg;
  Vec inlier,outlier,outMu(d);double priorProb=.99,outProb=.01,oldScore,score=0;int iter=0,converged=0;
  if(!expectation(x,mu,sigma,priorProb,outProb,uniformNlogl,inlier,outlier,oldScore))return 5;
  for(iter=0;iter<maxIter;iter++){
    double weight=inlier.sum();
    if(!(weight>0))return 6;
    mu.noalias()=x.transpose()*inlier/weight;
    // Retain original second output mean row, although only Gaussian row is used.
    outMu.noalias()=x.transpose()*outlier/weight;
    Mat centered=x.rowwise()-mu.transpose();
    Vec root=inlier.array().sqrt();centered.array().colwise()*=root.array();
    sigma.noalias()=centered.transpose()*centered/weight;
    Eigen::SelfAdjointEigenSolver<Mat> es(sigma,Eigen::EigenvaluesOnly);
    if(es.info()!=Eigen::Success)return 7;
    sigma.diagonal().array()+=std::abs(spacing(es.eigenvalues().maxCoeff()));
    double outside=outlier.sum(),den=outside+weight;outProb=outside/den;priorProb=weight/den;
    if(!expectation(x,mu,sigma,priorProb,outProb,uniformNlogl,inlier,outlier,score))return 8;
    double diff=score-oldScore;
    if(diff>=0&&diff<relErr*std::abs(score)){converged=1;break;}
    oldScore=score;
  }
  for(int j=0;j<d;j++){outputMu[j]=mu(j);outputMu[d+j]=outMu(j);}
  OutMap(outputSigma,d,d)=sigma;
  outputInfo[0]=score;outputInfo[1]=outProb;outputInfo[2]=std::min(iter,maxIter-1);
  outputInfo[3]=converged;return 0;
}

EMSCRIPTEN_KEEPALIVE int sb_map(const double* projected,int n,int d,const double* mu,const double* sigma,
 double* output){
  if(n<1||d<1)return 1;
  Map x(projected,n,d);Eigen::Map<const Vec> m(mu,d);Map s(sigma,d,d);
  Vec mahal;double logdet;
  if(!distances(x,m,s,mahal,logdet))return 5;
  Eigen::Map<Vec>(output,n)=mahal;return 0;
}
}

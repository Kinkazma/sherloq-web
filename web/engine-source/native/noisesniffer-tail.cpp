// SciPy 1.17.1 binomial survival, pinned Boost.Math submodule and policy.
#define BOOST_MATH_STANDALONE
#include <boost/math/distributions/binomial.hpp>
#include <cmath>
#include <limits>
using NoisesnifferPolicy=boost::math::policies::policy<
 boost::math::policies::domain_error<boost::math::policies::ignore_error>,
 boost::math::policies::overflow_error<boost::math::policies::throw_on_error>,
 boost::math::policies::evaluation_error<boost::math::policies::throw_on_error>,
 boost::math::policies::promote_float<false>,boost::math::policies::promote_double<false>,
 boost::math::policies::discrete_quantile<boost::math::policies::integer_round_up>>;
extern "C" double cv_noisesniffer_log_tail(double K,double N,int w,double p){
 try{
  const double k=std::floor(K/double(w*w)),n=std::ceil(N/double(w*w));
  if(k<=0)return 0.;if(k>n)return -std::numeric_limits<double>::infinity();
  const double survival=boost::math::cdf(boost::math::complement(boost::math::binomial_distribution<double,NoisesnifferPolicy>(n,p),k-1));
  if(survival>0)return std::log(survival);
  const double first=std::lgamma(n+1)-std::lgamma(k+1)-std::lgamma(n-k+1)+k*std::log(p)+(n-k)*std::log1p(-p);
  double term=1,total=1;
  for(double j=k;j<n;j++){term*=((n-j)/(j+1))*p/(1-p);total+=term;if(term<total*1e-16)break;}
  return first+std::log(total);
 }catch(...){return std::numeric_limits<double>::quiet_NaN();}
}

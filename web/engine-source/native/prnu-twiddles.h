// Image-independent pocketfft seeds frozen from the native reference libm.
// The supplied buffer is validated before any seed is made visible to a plan.
#include <cstdint>
#include <cstring>
#include <vector>
#include <cmath>
#include <stdexcept>
#include <algorithm>
namespace sherloq_prnu {
struct SeedIndex {uint32_t n,offset,first,second;};
static std::vector<SeedIndex> indices;
static std::vector<double> seeds;
}
extern "C" int cv_prnu_twiddles(const uint8_t* data,size_t size){
 try {
  if(size<24||std::memcmp(data,"PRNUFFT1",8))return 0;
  uint32_t header[4];std::memcpy(header,data+8,16);
  if(header[0]!=2097152||header[1]!=582||header[2]!=738424||header[3]!=0)return 0;
  if(size!=24+size_t(header[1])*16+size_t(header[2])*8)return 0;
  std::vector<sherloq_prnu::SeedIndex> index(header[1]);
  std::memcpy(index.data(),data+24,index.size()*16);
  size_t offset=0,previous=0;
  for(const auto& r:index){
   if(r.n<=previous||r.n>header[0]||r.offset!=offset)return 0;
   size_t nval=(size_t(r.n)+2)/2,first=2;
   while(first*first<nval)first*=2;
   if(r.first!=first||r.second!=(nval+first-1)/first)return 0;
   offset+=2*(size_t(r.first)+r.second);previous=r.n;
  }
  if(offset!=header[2])return 0;
  std::vector<double> values(header[2]);
  std::memcpy(values.data(),data+24+index.size()*16,values.size()*8);
  for(double x:values)if(!std::isfinite(x)||std::abs(x)>1)return 0;
  sherloq_prnu::indices.swap(index);sherloq_prnu::seeds.swap(values);return 1;
 }catch(...){return 0;}
}
static const double* sherloq_prnu_twiddle_seeds(size_t n,size_t first,size_t second){
 const auto& index=sherloq_prnu::indices;
 auto it=std::lower_bound(index.begin(),index.end(),n,[](const auto& record,size_t length){return record.n<length;});
 if(it==index.end()||it->n!=n||it->first!=first||it->second!=second)throw std::runtime_error("Unqualified PRNU FFT length");
 return sherloq_prnu::seeds.data()+it->offset;
}

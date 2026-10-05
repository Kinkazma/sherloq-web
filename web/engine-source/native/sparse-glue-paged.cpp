#include <cmath>
#include <algorithm>
#include <cstdint>
extern "C" {
// CSR rows retain native edge order. Each query is independent only after its
// complete candidate domain has been assembled; never normalize an edge page.
void glue_attention(const float*q,const float*k,const float*v,const int32_t*offset,const int32_t*target,int rows,int keys,int heads,int dim,float*out,float*scratch){
 for(int h=0;h<heads;h++)for(int i=0;i<rows;i++){
  const int begin=offset[i],end=offset[i+1];float maximum=-INFINITY;
  for(int e=begin;e<end;e++){float sum=0;const float*a=q+(h*rows+i)*dim,*b=k+(h*keys+target[e])*dim;for(int d=0;d<dim;d++)sum+=a[d]*b[d];scratch[e-begin]=sum;maximum=std::max(maximum,sum);}
  float sum=0;for(int e=begin;e<end;e++)sum+=std::exp(scratch[e-begin]-maximum);const float logsum=std::log(sum);float*o=out+(h*rows+i)*dim;std::fill(o,o+dim,0.f);
  for(int e=begin;e<end;e++){float weight=std::exp((scratch[e-begin]-maximum)-logsum);const float*b=v+(h*keys+target[e])*dim;for(int d=0;d<dim;d++)o[d]+=weight*b[d];}
 }
}
void glue_logits(const float*a,const float*b,const int32_t*edges,int count,int dim,float*out){for(int e=0;e<count;e++){float sum=0;for(int d=0;d<dim;d++)sum+=a[edges[e*2]*dim+d]*b[edges[e*2+1]*dim+d];out[e]=sum;}}
void glue_stats(const float*logits,const int32_t*offset,const int32_t*ids,int rows,float*maximum,float*logsum){for(int i=0;i<rows;i++){float m=-INFINITY;for(int e=offset[i];e<offset[i+1];e++)m=std::max(m,logits[ids[e]]);maximum[i]=m;float s=0;for(int e=offset[i];e<offset[i+1];e++)s+=std::exp(logits[ids[e]]-m);logsum[i]=std::log(s);}}
void glue_confidence(const float*logits,const int32_t*edges,int count,const float*m0,const float*s0,const float*m1,const float*s1,const float*z0,const float*z1,float*out){for(int e=0;e<count;e++){int i=edges[e*2],j=edges[e*2+1];float v=(logits[e]-m0[i])-s0[i];v+=(logits[e]-m1[j])-s1[j];v+=z0[i];v+=z1[j];out[e]=std::exp(v);}}
}

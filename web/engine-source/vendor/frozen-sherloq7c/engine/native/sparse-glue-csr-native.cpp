// The original four exported functions are compiled unchanged, not replaced.
#include "sparse-glue-paged.cpp"
extern "C" {
// Input and output are head-major [heads,edges]. Each offset row is complete,
// in its unchanged Native edge order. Caller owns disjoint logits/weights.
// This is exactly the normalization/weight body of glue_attention, with its
// already computed scratch logits supplied instead of repeating any dot.
void glue_attention_weights(const float*logits,const int32_t*offset,int rows,int edges,int heads,float*out){
 for(int h=0;h<heads;h++)for(int i=0;i<rows;i++){
  const int begin=offset[i],end=offset[i+1];float maximum=-INFINITY;
  for(int e=begin;e<end;e++)maximum=std::max(maximum,logits[h*edges+e]);
  float sum=0;for(int e=begin;e<end;e++)sum+=std::exp(logits[h*edges+e]-maximum);const float logsum=std::log(sum);
  for(int e=begin;e<end;e++)out[h*edges+e]=std::exp((logits[h*edges+e]-maximum)-logsum);
 }
}
}

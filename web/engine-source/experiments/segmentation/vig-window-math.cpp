// Additive VIG population operators. The original arithmetic is included intact.
// Build with its source directory on the include path; no original file is edited.
#include "vig-math.cpp"

extern "C" int vig_window_normalize(const float*x,int M,float*out,float*sums){
 if(M<256||M%256)return 0;
 for(int j=0;j<M;j++){
  float total=0;for(int c=0;c<640;c++){const float v=x[c*M+j];total=std::fma(v,v,total);}const float norm=std::fmax(std::sqrt(total),1e-12f);
  float buf[640],partials[4]={};for(int c=0;c<640;c++){const float v=x[c*M+j]/norm;out[c*M+j]=v;buf[c]=v*v;}
  int count=640;for(int level=0;level<4;level++){const int chunks=count/16;for(int t=chunks*16;t<count;t++)partials[level]+=buf[t];for(int t=0;t<chunks;t++){float s=0;for(int q=0;q<16;q++)s+=buf[t*16+q];buf[t]=s;}count=chunks;}
  float s=partials[0];for(int level=1;level<4;level++)s+=partials[level];sums[j]=s;
 }
 return 1;
}

// A complete target population is retained for every requested query row.
// Only the row destination is local: rows [0,count), not [first,first+count).
extern "C" int vig_window_distance_rows(const float*x,const float*sums,int M,int first,int count,float*out){
 if(M<256||M%256||first<0||count<1||first>M-count)return 0;
 for(int i=first;i<first+count;i++)for(int j=0;j<M;j+=4){v128_t sum=wasm_f32x4_splat(0);for(int c=0;c<640;c++)sum=d2prl_fma4(wasm_f32x4_splat(x[c*M+i]),wasm_v128_load(x+c*M+j),sum);
  sum=wasm_f32x4_mul(sum,wasm_f32x4_splat(-2));sum=wasm_f32x4_add(wasm_f32x4_splat(sums[i]),sum);sum=wasm_f32x4_add(sum,wasm_v128_load(sums+j));sum=wasm_f32x4_neg(sum);wasm_v128_store(out+(i-first)*M+j,sum);}
 return 1;
}

extern "C" int vig_window_topk_rows(const float*x,int M,int count,int k,int32_t*out){
 if(M<256||M%256||count<1||k<1||k>M)return 0;
 using P=std::pair<float,int64_t>;std::vector<P> q(M);auto less=[](const P&a,const P&b){return(std::isnan(a.first)&&!std::isnan(b.first))||a.first>b.first;};
 for(int i=0;i<count;i++){for(int j=0;j<M;j++)q[j]={x[i*M+j],j};std::nth_element(q.begin(),q.begin()+k-1,q.end(),less);std::sort(q.begin(),q.begin()+k-1,less);for(int j=0;j<k;j++)out[i*k+j]=q[j].second;}
 return 1;
}

// Indices and output are local query rows; centers still refer to global M.
// Center/relative remain interleaved PER CHANNEL, as in the native operator.
extern "C" int vig_window_gather_rows(const float*x,int M,int k,int dilation,const int32_t*idx,int first,int count,float*out){
 if(M<256||M%256||k<1||dilation<1||k>M/dilation||first<0||count<1||first>M-count)return 0;
 for(int i=0;i<count;i++)for(int j=0;j<k;j++)if(idx[i*k*dilation+j*dilation]<0||idx[i*k*dilation+j*dilation]>=M)return 0;
 for(int c=0;c<640;c++)for(int r=0;r<count;r++){const float v=x[c*M+first+r];float max=-INFINITY;for(int j=0;j<k;j++)max=std::max(max,x[c*M+idx[r*k*dilation+j*dilation]]-v);out[c*count*2+r]=v;out[c*count*2+count+r]=max;}
 return 1;
}

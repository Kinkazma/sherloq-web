// SAFIRE native mask reconstruction and streamed proposal descriptors.
// Reference Torch 2.8 CPU expressions; no segmentation or descriptor substitute.
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <random>
#include <vector>
#include "../experiments/d2prl/sum.cpp"
#include "../experiments/d2prl/dlf.cpp"
static float mask_pixel(const float* mask,int x,int y){
 const float sx=std::max(0.f,std::fma(.25f,float(x)+.5f,-.5f)),sy=std::max(0.f,std::fma(.25f,float(y)+.5f,-.5f));const int x0=std::min(255,int(sx)),x1=std::min(255,x0+1),y0=std::min(255,int(sy)),y1=std::min(255,y0+1);const float lx=sx-x0,ly=sy-y0;
 const float a=std::fma(mask[y0*256+x0],1.f-lx,mask[y0*256+x1]*lx),b=std::fma(mask[y1*256+x0],1.f-lx,mask[y1*256+x1]*lx);return std::fma(a,1.f-ly,b*ly);
}
extern "C" int safire_proposal(const float* features,const float* low,float* mean,uint32_t* area){
 if(!features||!low||!mean||!area)return -1;int indices[4096],selected=0;uint32_t count=0;
 for(int y=0;y<1024;y++)for(int x=0;x<1024;x++){const float v=mask_pixel(low,x,y);count+=v>0;if(x%16==0&&y%16==0&&v>0)indices[selected++]=(y/16)*64+x/16;}
 *area=count;if(!selected)return 0;float row[4096];
 for(int c=0;c<256;c++){for(int i=0;i<selected;i++)row[i]=features[c*4096+indices[i]];mean[c]=d2prl_sum_row(row,selected)/float(selected);if(!std::isfinite(mean[c]))return 0;}return selected;
}
extern "C" int safire_maps(const float* masks,const uint32_t* areas,int channels,int binary,float* probabilities,float* map,uint8_t* labels){
 if(!masks||!areas||!probabilities||!map||!labels||channels<1||channels>64||(binary!=0&&binary!=1))return 0;
 const int n=1024*1024,front=channels>1&&areas[0]>areas[1]?1:0,back=1-front;float logits[64],exps[64];
 for(int y=0;y<1024;y++)for(int x=0;x<1024;x++){
  const int i=y*1024+x;float maximum=-INFINITY;for(int c=0;c<channels;c++){logits[c]=mask_pixel(masks+c*65536,x,y);maximum=std::max(maximum,logits[c]);}
  float sum=0;for(int c=0;c<channels;c++){exps[c]=reference_exp(logits[c]-maximum);sum+=exps[c];}
  float best=-1;uint8_t label=0;for(int c=0;c<channels;c++){const float p=exps[c]/sum;probabilities[c*n+i]=p;if(p>best){best=p;label=c;}}
  labels[i]=label;
  if(binary){const float a=1.f/(1.f+exp_signed(-logits[front]));map[i]=channels==1?a:(a+(1.f-1.f/(1.f+exp_signed(-logits[back]))))/2.f;}
  else map[i]=best;
 }return 1;
}
// NumPy RandomState's legacy MT19937 permutation, including its bounded integer
// rejection. Its seed and sample order are part of SAFIRE's native contract.
extern "C" int safire_initial(int count,int groups,int* output){
 if(count<1||count>1024||groups<1||groups>std::min(count,16))return 0;
 std::mt19937 rng(1701);std::vector<int> ids(count);for(int i=0;i<count;i++)ids[i]=i;
 for(int i=count-1;i>0;i--){uint32_t mask=i;mask|=mask>>1;mask|=mask>>2;mask|=mask>>4;mask|=mask>>8;mask|=mask>>16;uint32_t j;do{j=rng()&mask;}while(j>uint32_t(i));std::swap(ids[i],ids[j]);}
 std::copy(ids.begin(),ids.begin()+groups,output);return 1;
}
static float vector_norm(const float* x){float lanes[4]={};for(int i=0;i<256;i++)lanes[i%4]+=x[i]*x[i];return std::sqrt(((lanes[0]+lanes[1])+lanes[2])+lanes[3]);}
static float selected_mean(const float* features,const std::vector<int>& selected,int c){
 const int n=selected.size();int ceil_log=0;for(int v=n-1;v>0;v>>=1)ceil_log++;const int power=std::max(4,ceil_log/4),step=1<<power,mask=step-1;float acc[4]={};int i=0;
 for(;i+step<=n;){for(int j=0;j<step;j++,i++)acc[0]+=features[selected[i]*256+c];for(int level=1;level<4;level++){acc[level]+=acc[level-1];acc[level-1]=0;if(i&(mask<<(level*power)))break;}}
 for(;i<n;i++)acc[0]+=features[selected[i]*256+c];for(int level=1;level<4;level++)acc[0]+=acc[level];return acc[0]/float(n);
}
extern "C" int safire_kmeans(const float* features,int count,int groups,int* labels){
 if(!features||!labels||count<1||count>1024||groups<1||groups>16)return 0;groups=std::min(groups,count);
 int ids[16];safire_initial(count,groups,ids);std::vector<float> centres(groups*256),unit(count*256),normalized(groups*256),old(groups*256);float products[256],squares[256],shifts[16];
 for(int g=0;g<groups;g++)std::copy(features+ids[g]*256,features+(ids[g]+1)*256,centres.data()+g*256);
 for(int i=0;i<count;i++){float norm=std::max(vector_norm(features+i*256),1e-12f);for(int c=0;c<256;c++)unit[i*256+c]=features[i*256+c]/norm;}
 for(int iteration=0;iteration<1001;iteration++){
  old=centres;for(int g=0;g<groups;g++){float norm=std::max(vector_norm(centres.data()+g*256),1e-12f);for(int c=0;c<256;c++)normalized[g*256+c]=centres[g*256+c]/norm;}
  for(int i=0;i<count;i++){float best=INFINITY;int label=0;for(int g=0;g<groups;g++){for(int c=0;c<256;c++)products[c]=unit[i*256+c]*normalized[g*256+c];float distance=1.f-d2prl_sum_row(products,256);if(distance<best){best=distance;label=g;}}labels[i]=label;}
  for(int g=0;g<groups;g++){std::vector<int> selected;for(int i=0;i<count;i++)if(labels[i]==g)selected.push_back(i);if(!selected.empty())for(int c=0;c<256;c++){centres[g*256+c]=selected_mean(features,selected,c);}for(int c=0;c<256;c++){float d=centres[g*256+c]-old[g*256+c];squares[c]=d*d;}shifts[g]=std::sqrt(d2prl_sum_row(squares,256));}
  float shift=d2prl_sum_row(shifts,groups);if(shift*shift<1e-4f)return iteration+1;
 }return 1001;
}
extern "C" int safire_dbscan(const float* features,int count,double eps,int minimum,int* labels){
 if(!features||!labels||count<1||count>1024||!(eps>0)||minimum<1)return 0;
 const double bound=eps*eps;auto neighbor=[&](int a,int b){double sum=0;for(int c=0;c<256;c++){double d=double(features[a*256+c])-double(features[b*256+c]);sum+=d*d;}return sum<=bound;};
 std::vector<uint8_t> core(count);for(int i=0;i<count;i++){int n=0;for(int j=0;j<count;j++)n+=neighbor(i,j);core[i]=n>=minimum;labels[i]=-1;}
 int cluster=0;std::vector<int> stack;for(int seed=0;seed<count;seed++){if(labels[seed]!=-1||!core[seed])continue;int i=seed;for(;;){if(labels[i]==-1){labels[i]=cluster;if(core[i])for(int j=0;j<count;j++)if(labels[j]==-1&&neighbor(i,j))stack.push_back(j);}if(stack.empty())break;i=stack.back();stack.pop_back();}cluster++;}return cluster;
}

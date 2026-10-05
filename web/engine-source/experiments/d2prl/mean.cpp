// Portable contiguous float32 reduction matching the pinned PyTorch2.8 CPU
// four-lane cascade sum (SumKernel.cpp). PyTorch BSD notice is retained nearby.
#include <algorithm>
extern "C" int d2prl_mean_planes(const float* input,int channels,int plane,int reciprocal,float* sums,float* means){
 if(channels<2||channels>2048||plane<4||plane>224*224)return 0;
 const int vectors=plane/4,groups=vectors/4;int ceil_log=0;for(int v=groups-1;v>0;v>>=1)ceil_log++;
 const int power=std::max(4,ceil_log/4),step=1<<power,mask=step-1;
 for(int c=0;c<channels;c++){
  const float* row=input+c*plane;float acc[4][4][4]={};int i=0;
  for(;i+step<=groups;){
   for(int j=0;j<step;j++,i++)for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][r][lane]+=row[i*16+r*4+lane];
   for(int level=1;level<4;level++){for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++){acc[level][r][lane]+=acc[level-1][r][lane];acc[level-1][r][lane]=0.f;}if(i&(mask<<(level*power)))break;}
  }
  for(;i<groups;i++)for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][r][lane]+=row[i*16+r*4+lane];
  for(int level=1;level<4;level++)for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][r][lane]+=acc[level][r][lane];
  for(int v=groups*4;v<vectors;v++)for(int lane=0;lane<4;lane++)acc[0][0][lane]+=row[v*4+lane];
  for(int r=1;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][0][lane]+=acc[0][r][lane];
  float total=0;for(int j=vectors*4;j<plane;j++)total+=row[j];for(int lane=0;lane<4;lane++)total+=acc[0][0][lane];
  sums[c]=total;means[c]=reciprocal?total*(1.f/float(plane)):total/float(plane);
 }return 1;
}

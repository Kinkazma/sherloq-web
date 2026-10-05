// Pinned PyTorch2.8 contiguous float32 cascade reduction and pinned OpenMP two-pass partition.
// BSD reference notice is retained in this directory. reference_threads defines
// numerical order; it is not the number of browser workers to allocate.
#include <algorithm>
static float d2prl_sum_row(const float* row,int plane){
 const int vectors=plane/4,groups=vectors/4;int ceil_log=0;for(int v=groups-1;v>0;v>>=1)ceil_log++;
 const int power=std::max(4,ceil_log/4),step=1<<power,mask=step-1;float acc[4][4][4]={};int i=0;
 for(;i+step<=groups;){
  for(int j=0;j<step;j++,i++)for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][r][lane]+=row[i*16+r*4+lane];
  for(int level=1;level<4;level++){for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++){acc[level][r][lane]+=acc[level-1][r][lane];acc[level-1][r][lane]=0.f;}if(i&(mask<<(level*power)))break;}
 }
 for(;i<groups;i++)for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][r][lane]+=row[i*16+r*4+lane];
 for(int level=1;level<4;level++)for(int r=0;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][r][lane]+=acc[level][r][lane];
 for(int v=groups*4;v<vectors;v++)for(int lane=0;lane<4;lane++)acc[0][0][lane]+=row[v*4+lane];
 for(int r=1;r<4;r++)for(int lane=0;lane<4;lane++)acc[0][0][lane]+=acc[0][r][lane];
 float total=0;for(int j=vectors*4;j<plane;j++)total+=row[j];for(int lane=0;lane<4;lane++)total+=acc[0][0][lane];return total;
}
extern "C" int d2prl_sum_all(const float* input,int count,int reference_threads,float* output){
 if(count<1||count>4*1024*1024||reference_threads<1||reference_threads>8)return 0;
 if(count<32768||reference_threads==1){*output=d2prl_sum_row(input,count);return 1;}
 const int tasks=std::min(reference_threads,(count+32767)/32768),chunk=(count+tasks-1)/tasks;float partial[8]={};
 for(int t=0,start=0;start<count;t++,start+=chunk)partial[t]=d2prl_sum_row(input+start,std::min(chunk,count-start));
 *output=d2prl_sum_row(partial,reference_threads);return 1;
}

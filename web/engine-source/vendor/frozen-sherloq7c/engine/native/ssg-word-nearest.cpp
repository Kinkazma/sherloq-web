#include <algorithm>
#include <vector>
#include <new>
#include <cstdint>
#include "../vendor/ssg-word-nearest/nearest.h"
// The identical FullNearest also serves the existing Native phrase stage.
// Group-local IDs follow ascending original IDs, preserving every tie order.
extern "C" {
uintptr_t ssg_word_tree_create(const double *data,int count){
 if(!data||count<3)return 0;
 try{return reinterpret_cast<uintptr_t>(new FullNearest(data,24,count));}
 catch(const std::bad_alloc&){return 0;}
}
int ssg_word_tree_query(uintptr_t handle,int first,int count,double *output){
 auto *tree=reinterpret_cast<FullNearest*>(handle);
 if(!tree||first<0||count<0||first+count>(int)tree->nodes.size()||!output)return -1;
 try{for(int row=0;row<count;row++){
  const auto best=tree->query(first+row,2);if(best.size()!=2)return -1;
  output[row*4]=best[0].id;output[row*4+1]=best[1].id;
  output[row*4+2]=best[0].distance;output[row*4+3]=best[1].distance;
 }return 0;}catch(const std::bad_alloc&){return -2;}
}
void ssg_word_tree_release(uintptr_t handle){delete reinterpret_cast<FullNearest*>(handle);}
}

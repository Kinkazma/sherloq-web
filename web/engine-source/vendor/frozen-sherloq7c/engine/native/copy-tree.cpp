// Balanced, compact two-dimensional cKDTree permutation. scipy 1.17.1 build.cxx,
// BSD-3-Clause (vendor/copy-tree/SCIPY-LICENSE.txt). Query results visit leaves in
// this order; preserving it matters to native pair-row and RANSAC ordering.
#include <algorithm>
#include <cstdint>
#include <cmath>
static void build(const double* coords,uint32_t* first,uint32_t* last){
 if(last-first<=16)return;
 double low[2]={coords[*first*2],coords[*first*2+1]},high[2]={low[0],low[1]};
 for(auto p=first+1;p!=last;++p)for(int d=0;d<2;d++){low[d]=std::min(low[d],coords[*p*2+d]);high[d]=std::max(high[d],coords[*p*2+d]);}
 const int axis=high[1]-low[1]>high[0]-low[0]?1:0;if(high[axis]==low[axis])return;
 auto less=[=](uint32_t a,uint32_t b){return coords[a*2+axis]<coords[b*2+axis];};auto middle=first+(last-first)/2;
 std::nth_element(first,middle,last,less);double split=coords[*middle*2+axis];auto end=std::partition(first,middle,[=](uint32_t a){return coords[a*2+axis]<split;});
 if(end==first){const auto p=*std::min_element(first,last,less);split=std::nextafter(coords[p*2+axis],INFINITY);end=std::partition(first,last,[=](uint32_t a){return coords[a*2+axis]<split;});}
 if(end==last){const auto p=*std::max_element(first,last,less);split=coords[p*2+axis];end=std::partition(first,last,[=](uint32_t a){return coords[a*2+axis]<split;});}
 if(end==first||end==last)return;
 build(coords,first,end);build(coords,end,last);
}
extern "C" int copy_tree_order(const double* coords,uint32_t* order,int n){
 if(n<0||n>1000000||(!coords&&n)||(!order&&n))return 0;
 for(int i=0;i<n;i++)order[i]=i;if(n)build(coords,order,order+n);return 1;
}

#include "ckdtree_decl.h"
#include <algorithm>
#include <numeric>
#include <memory>
struct PeerTree {
 ckdtree tree{};std::vector<ckdtreenode> nodes;std::vector<double> data,minima,maxima;std::vector<ckdtree_intp_t> ids;
 PeerTree(const double* input,int n,int dims):data(input,input+n*dims),minima(dims),maxima(dims),ids(n){
  std::iota(ids.begin(),ids.end(),0);tree.tree_buffer=&nodes;tree.raw_data=data.data();tree.n=n;tree.m=dims;tree.leafsize=16;tree.raw_indices=ids.data();tree.raw_mins=minima.data();tree.raw_maxes=maxima.data();
  for(int d=0;d<dims;d++){minima[d]=maxima[d]=input[d];for(int i=1;i<n;i++){minima[d]=std::min(minima[d],input[i*dims+d]);maxima[d]=std::max(maxima[d],input[i*dims+d]);}}
  auto low=minima,high=maxima;build_ckdtree(&tree,0,n,high.data(),low.data(),1,1);tree.ctree=nodes.data();tree.size=nodes.size();
  // Cython also repairs every child pointer after vector construction.
  for(auto& node:nodes)if(node.split_dim!=-1){node.less=tree.ctree+node._less;node.greater=tree.ctree+node._greater;}
 }
};
extern "C" {
PeerTree* ela_peers_create(const double* data,int n,int dims){if(!data||n<1||dims<1||dims>64)return nullptr;try{return new PeerTree(data,n,dims);}catch(...){return nullptr;}}
int ela_peers_query(PeerTree* handle,const double* points,int count,int k,double* distances,ckdtree_intp_t* indices){if(!handle||!points||!distances||!indices||count<1||k<1||k>handle->tree.n)return 0;try{std::vector<ckdtree_intp_t> rank(k);std::iota(rank.begin(),rank.end(),1);query_knn(&handle->tree,distances,indices,points,count,rank.data(),k,k,0,2,HUGE_VAL);return 1;}catch(...){return 0;}}
void ela_peers_release(PeerTree* handle){delete handle;}
}

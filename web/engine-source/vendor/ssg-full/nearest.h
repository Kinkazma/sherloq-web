// Owned exact balanced KD-tree: identical split/tie/query rules to ssg.js.
#pragma once
#include <cmath>
#include <numeric>
#include <limits>
struct FullNearest {
 struct Node{int id,axis,left=-1,right=-1;};struct Match{int id;double distance;};
 const double*data;int dims,root;std::vector<Node>nodes;
 FullNearest(const double*d,int D,int count):data(d),dims(D){nodes.reserve(count);std::vector<int>ids(count);std::iota(ids.begin(),ids.end(),0);root=build(ids,0,count);}
 int build(std::vector<int>&ids,int begin,int end){if(begin==end)return -1;int axis=0;double span=-1;
  for(int d=0;d<dims;d++){double low=INFINITY,high=-INFINITY;for(int i=begin;i<end;i++){double v=data[(size_t)ids[i]*dims+d];low=std::min(low,v);high=std::max(high,v);}if(high-low>span){axis=d;span=high-low;}}
  std::sort(ids.begin()+begin,ids.begin()+end,[&](int a,int b){double x=data[(size_t)a*dims+axis],y=data[(size_t)b*dims+axis];return x<y||(x==y&&a<b);});int middle=begin+(end-begin)/2,id=nodes.size();nodes.push_back({ids[middle],axis});int left=build(ids,begin,middle),right=build(ids,middle+1,end);nodes[id].left=left;nodes[id].right=right;return id;
 }
 double distance(int a,int b)const{double sum=0;for(int d=0;d<dims;d++){double x=data[(size_t)a*dims+d]-data[(size_t)b*dims+d];sum+=x*x;}return sum;}
 void visit(int node,int id,int k,std::vector<Match>&best)const{if(node<0)return;auto n=nodes[node];double delta=data[(size_t)id*dims+n.axis]-data[(size_t)n.id*dims+n.axis];int first=delta<=0?n.left:n.right,other=delta<=0?n.right:n.left;visit(first,id,k,best);
  if(n.id!=id){double dist=distance(id,n.id);auto pos=std::lower_bound(best.begin(),best.end(),Match{n.id,dist},[](const Match&a,const Match&b){return a.distance<b.distance||(a.distance==b.distance&&a.id<b.id);});if((int)best.size()<k||pos!=best.end()){best.insert(pos,{n.id,dist});if((int)best.size()>k)best.pop_back();}}
  if((int)best.size()<k||delta*delta<=best.back().distance)visit(other,id,k,best);
 }
 std::vector<Match> query(int id,int k)const{std::vector<Match>best;best.reserve(k+1);if(k)visit(root,id,k,best);return best;}
};

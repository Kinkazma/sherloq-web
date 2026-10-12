// Local native oracle harness. Data/models never enter the source repository.
#include <fstream>
#include <string>
#include <vector>
#include <iostream>
#include "wrapper.cpp"
std::vector<unsigned char> file(const std::string&p){std::ifstream f(p,std::ios::binary);if(!f)throw std::runtime_error(p);return std::vector<unsigned char>((std::istreambuf_iterator<char>(f)),{});}
void* npy(std::vector<unsigned char>&a){if(a[0]!=147||a[6]!=1)throw std::runtime_error("NPY1 required");return a.data()+10+a[8]+256*a[9];}
void write(const std::string&p,void*data,size_t n){std::ofstream f(p,std::ios::binary);f.write((char*)data,n);}
int main(int argc,char**argv){if(argc!=6)return 2;std::string dir=argv[1],prefix=argv[5];int h=atoi(argv[3]),w=atoi(argv[4]);
 auto thrs=file(dir+"/thrs.npy"),fids=file(dir+"/fids.npy"),child=file(dir+"/child.npy"),segs=file(dir+"/segs.npy"),ns=file(dir+"/nSegs.npy"),eb=file(dir+"/eBins.npy"),bounds=file(dir+"/eBnds.npy"),input=file(argv[2]);
 if(input.size()!=(size_t)h*w*3)return 3;
 if(ssg_edges_set_model((float*)npy(thrs),(uint32*)npy(fids),(uint32*)npy(child),(uint8*)npy(segs),(uint8*)npy(ns),(uint16*)npy(eb),(uint32*)npy(bounds),79861,19306620,1916665))return 4;
 int n=ssg_edges_detect(input.data(),h,w,1);if(n<0)return 5;
 write(prefix+"-edge.bin",ssg_edges_output(),n*4);write(prefix+"-regular.bin",ssg_edges_regular(),ssg_edges_channel_count()*4);write(prefix+"-similar.bin",ssg_edges_similar(),ssg_edges_channel_count()*4);write(prefix+"-leaves.bin",ssg_edges_leaves(),ssg_edges_leaf_count()*4);ssg_edges_release();return 0;
}

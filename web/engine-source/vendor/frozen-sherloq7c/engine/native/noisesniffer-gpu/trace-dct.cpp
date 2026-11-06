#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>
#include <unordered_map>
extern "C" int sherloq_noisesniffer_dct(double*,size_t,size_t);
struct Node{uint32_t op,a,b,c,source;double value;};
static std::vector<Node> nodes;static std::unordered_map<uint64_t,uint32_t> constants;static std::vector<uint32_t> outputs;
static constexpr uint64_t tagMask=0x7ff8cafe00000000ULL;
static uint64_t bits(double value){uint64_t b;std::memcpy(&b,&value,8);return b;}
static double fromBits(uint64_t word){double v;std::memcpy(&v,&word,8);return v;}
static bool tagged(double value){return (bits(value)&0xffffffff00000000ULL)==tagMask;}
static double actual(double value){return tagged(value)?nodes[uint32_t(bits(value))].value:value;}
static uint32_t id(double value){if(tagged(value))return uint32_t(bits(value));uint64_t key=bits(value);auto prior=constants.find(key);if(prior!=constants.end())return prior->second;uint32_t out=nodes.size();nodes.push_back({1,0,0,0,0,value});constants[key]=out;return out;}
static double node(uint32_t op,double x,double y,double z,double value){if(!tagged(x)&&!tagged(y)&&!tagged(z))return value;uint32_t a=id(x),b=id(y),c=id(z),out=nodes.size();nodes.push_back({op,a,b,c,0,value});return fromBits(tagMask|out);}
extern "C" double trace_fadd(double x,double y){return node(3,x,y,0,actual(x)+actual(y));}
extern "C" double trace_fsub(double x,double y){return node(4,x,y,0,actual(x)-actual(y));}
extern "C" double trace_fmul(double x,double y){return node(5,x,y,0,actual(x)*actual(y));}
extern "C" double trace_fdiv(double x,double y){return node(6,x,y,0,actual(x)/actual(y));}
extern "C" double trace_fneg(double x){return node(7,x,0,0,-actual(x));}
extern "C" double trace_fma(double x,double y,double z){return node(8,x,y,z,std::fma(actual(x),actual(y),actual(z)));}
extern "C" bool trace_cmp(int kind,double x,double y){const double a=actual(x),b=actual(y);const bool unordered=std::isnan(a)||std::isnan(b);switch(kind){case 0:return false;case 1:return !unordered&&a==b;case 2:return !unordered&&a>b;case 3:return !unordered&&a>=b;case 4:return !unordered&&a<b;case 5:return !unordered&&a<=b;case 6:return !unordered&&a!=b;case 7:return !unordered;case 8:return unordered||a==b;case 9:return unordered||a>b;case 10:return unordered||a>=b;case 11:return unordered||a<b;case 12:return unordered||a<=b;case 13:return unordered||a!=b;case 14:return unordered;case 15:return true;default:return false;}}
extern "C" int trace_build(int width){
 if(width!=3&&width!=5&&width!=7&&width!=8)return 0;nodes.clear();constants.clear();outputs.clear();std::vector<double> data(2*width*width);
 for(uint32_t i=0;i<data.size();i++){uint32_t out=nodes.size();nodes.push_back({2,0,0,0,i,double(31+(i*53)%171)});data[i]=fromBits(tagMask|out);}
 if(!sherloq_noisesniffer_dct(data.data(),2,width))return 0;
 for(int i=0;i<width*width;i++){if(!tagged(data[i]))return 0;outputs.push_back(uint32_t(bits(data[i])));}
 return 1;
}
extern "C" const Node* trace_nodes(){return nodes.data();}
extern "C" size_t trace_count(){return nodes.size();}
extern "C" const uint32_t* trace_outputs(){return outputs.data();}

// Exact native preparation for the existing 7C Float64 graph contract.
// Work is resumable between bounded blocks; no reduced resolution or sampling.
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <limits>
#include <new>
#include <vector>

struct RawEdge { uint32_t low,high; double weight; };
struct Graph {
 uint32_t width,height,n,components=0,edges=0,phase=0,at=0,offset=0;
 const uint16_t *input;
 std::vector<double> source,levels,counts,area,difference,multiplicity;
 std::vector<uint16_t> nativeLevels;
 std::vector<uint32_t> parent,sizes,labels,row,cursor,order,temp,low,high;
 std::vector<int32_t> roots;
 std::vector<RawEdge> raw;
 uint32_t longest=0,sortRow=0,sortWidth=1,sortLeft=0,sortI=0,sortJ=0,sortMiddle=0,sortRight=0,sortOut=0,copyAt=0;
 bool mergeActive=false,fromTemp=false,copyBack=false;
 uint32_t radixPass=0,radixAt=0; uint32_t bucket[256]{}; bool scattering=false;
 uint32_t lastLow=0,lastHigh=0,writeEdge=0; bool haveLast=false;
 double total=0,mass=0,median=0,weak=0,minimum=std::numeric_limits<double>::infinity(),maximum=-std::numeric_limits<double>::infinity(),info[10]{};
 Graph(uint32_t w,uint32_t h,const uint16_t*p):width(w),height(h),n(w*h),input(p),source(n),parent(n),sizes(n),labels(n),roots(n){}
 uint32_t find(uint32_t i){while(parent[i]!=i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 uint16_t value(uint32_t i)const{return std::max(input[3*i],std::max(input[3*i+1],input[3*i+2]));}
 static int dy(uint32_t d){return d==0?0:1;}
 static int dx(uint32_t d){return d==1?0:d==3?-1:1;}
 bool neighbor(uint32_t i,uint32_t d,uint32_t &j)const{
  const uint32_t y=i/width,x=i-y*width;const int xx=int(x)+dx(d),yy=int(y)+dy(d);
  if(xx<0||yy<0||xx>=int(width)||yy>=int(height))return false;
  j=uint32_t(yy)*width+uint32_t(xx);return true;
 }
 bool before(uint32_t a,uint32_t b)const{
  if(raw[a].high!=raw[b].high)return raw[a].high<raw[b].high;
  return a<b; // Original order of equal pairs preserves weight accumulation.
 }
 uint32_t sortRead(bool tempSource,uint32_t begin,uint32_t pos)const{return tempSource?temp[pos]:order[begin+pos];}
 void sortWrite(bool tempSource,uint32_t begin,uint32_t pos,uint32_t v){if(tempSource)order[begin+pos]=v;else temp[pos]=v;}
 // Stable small-list sort and resumable merge sort for long adjacency lists.
 void sortRows(uint32_t &work){
  while(sortRow<components&&work){
   const uint32_t begin=row[sortRow],length=row[sortRow+1]-begin;
   if(length<=32){
    for(uint32_t i=1;i<length;i++){uint32_t index=order[begin+i],j=i;while(j&&before(index,order[begin+j-1])){order[begin+j]=order[begin+j-1];j--;}order[begin+j]=index;}
    work=work>length+1?work-length-1:0;sortRow++;continue;
   }
   if(copyBack){
    while(copyAt<length&&work){order[begin+copyAt]=temp[copyAt];copyAt++;work--;}
    if(copyAt==length){copyBack=false;fromTemp=false;copyAt=0;sortWidth=1;sortLeft=0;sortRow++;}
    continue;
   }
   if(sortWidth>=length){
    if(fromTemp){copyBack=true;copyAt=0;}else{sortWidth=1;sortLeft=0;sortRow++;}
    continue;
   }
   if(sortLeft>=length){fromTemp=!fromTemp;sortWidth*=2;sortLeft=0;continue;}
   if(!mergeActive){sortMiddle=std::min(length,sortLeft+sortWidth);sortRight=std::min(length,sortLeft+2*sortWidth);sortI=sortLeft;sortJ=sortMiddle;sortOut=sortLeft;mergeActive=true;}
   while(sortOut<sortRight&&work){
    bool takeLeft=sortI<sortMiddle&&(sortJ>=sortRight||!before(sortRead(fromTemp,begin,sortJ),sortRead(fromTemp,begin,sortI)));
    uint32_t index=takeLeft?sortRead(fromTemp,begin,sortI++):sortRead(fromTemp,begin,sortJ++);
    sortWrite(fromTemp,begin,sortOut++,index);work--;
   }
   if(sortOut==sortRight){sortLeft=sortRight;mergeActive=false;}
  }
 }
 uint32_t byteOf(uint32_t index,uint32_t pass)const{uint64_t bits;std::memcpy(&bits,&difference[index],8);return uint32_t((bits>>(pass*8))&255);}
 int step(uint32_t work){
  while(work&&phase<18){
   if(phase==0){
    while(at<n&&work){source[at]=double(value(at))/65535.;parent[at]=at;sizes[at]=1;roots[at]=-1;at++;work--;}
    if(at==n){phase=1;at=0;offset=0;}
   }else if(phase==1){
    while(offset<4&&work){
     while(at<n&&work){uint32_t j;if(neighbor(at,offset,j)&&source[at]==source[j]){uint32_t a=find(at),b=find(j);if(a!=b){if(sizes[a]<sizes[b])std::swap(a,b);parent[b]=a;sizes[a]+=sizes[b];}}at++;work--;}
     if(at==n){at=0;offset++;}
    }
    if(offset==4){phase=2;at=0;}
   }else if(phase==2){
    while(at<n&&work){uint32_t r=find(at);if(roots[r]<0)roots[r]=components++;labels[at]=uint32_t(roots[r]);at++;work--;}
    if(at==n){
     if(uint64_t(components)*components>9007199254740991ULL)return -3;
     std::vector<uint32_t>().swap(parent);std::vector<uint32_t>().swap(sizes);std::vector<int32_t>().swap(roots);
     levels.resize(components);nativeLevels.resize(components);counts.assign(components,0);area.resize(components);phase=3;at=0;
    }
   }else if(phase==3){
    while(at<n&&work){uint32_t i=labels[at];levels[i]=source[at];nativeLevels[i]=value(at);counts[i]++;at++;work--;}
    if(at==n){phase=4;at=0;}
   }else if(phase==4){
    while(at<components&&work){area[at]=counts[at]/double(n);at++;work--;}
    if(at==components){uint64_t capacity=uint64_t(height)*(width-1)+uint64_t(height-1)*width+2*uint64_t(height-1)*(width-1);if(capacity>0xffffffffULL)return -3;raw.reserve(uint32_t(capacity));phase=5;at=0;offset=0;}
   }else if(phase==5){
    while(offset<4&&work){
     while(at<n&&work){uint32_t j;if(neighbor(at,offset,j)&&source[at]!=source[j]){uint32_t l=source[at]<source[j]?at:j,h=source[at]<source[j]?j:at;raw.push_back({labels[l],labels[h],offset<2?1.:0.7071067811865476});}at++;work--;}
     if(at==n){offset++;at=0;}
    }
    if(offset==4){row.assign(components+1,0);order.resize(raw.size());phase=6;at=0;}
   }else if(phase==6){
    while(at<raw.size()&&work){row[raw[at].low+1]++;at++;work--;}
    if(at==raw.size()){phase=7;at=0;}
   }else if(phase==7){
    while(at<components&&work){longest=std::max(longest,row[at+1]);row[at+1]+=row[at];at++;work--;}
    if(at==components){cursor=row;temp.resize(longest>32?longest:0);phase=8;at=0;}
   }else if(phase==8){
    while(at<raw.size()&&work){order[cursor[raw[at].low]++]=at;at++;work--;}
    if(at==raw.size()){std::vector<uint32_t>().swap(cursor);phase=9;}
   }else if(phase==9){sortRows(work);if(sortRow==components){phase=10;at=0;haveLast=false;}}
   else if(phase==10){
    while(at<order.size()&&work){const auto &v=raw[order[at]];if(!haveLast||v.low!=lastLow||v.high!=lastHigh){edges++;lastLow=v.low;lastHigh=v.high;haveLast=true;}at++;work--;}
    if(at==order.size()){low.resize(edges);high.resize(edges);difference.resize(edges);multiplicity.assign(edges,0);phase=11;at=0;haveLast=false;writeEdge=0;}
   }else if(phase==11){
    while(at<order.size()&&work){const auto &v=raw[order[at]];if(!haveLast||v.low!=lastLow||v.high!=lastHigh){if(haveLast)writeEdge++;low[writeEdge]=v.low;high[writeEdge]=v.high;difference[writeEdge]=levels[v.high]-levels[v.low];lastLow=v.low;lastHigh=v.high;haveLast=true;}multiplicity[writeEdge]+=v.weight;at++;work--;}
    if(at==order.size()){std::vector<RawEdge>().swap(raw);std::vector<uint32_t>().swap(row);order.resize(edges);temp.resize(edges);phase=12;at=0;}
   }else if(phase==12){
    while(at<edges&&work){order[at]=at;at++;work--;}
    if(at==edges){phase=13;radixPass=0;radixAt=0;scattering=false;std::fill(bucket,bucket+256,0);}
   }else if(phase==13){
    if(radixPass==8){phase=14;at=0;continue;}
    if(!scattering){
     while(radixAt<edges&&work){bucket[byteOf(order[radixAt],radixPass)]++;radixAt++;work--;}
     if(radixAt==edges){uint32_t nonempty=0;for(auto v:bucket)nonempty+=v!=0;if(nonempty<=1){radixPass++;std::fill(bucket,bucket+256,0);radixAt=0;}else{uint32_t sum=0;for(auto &v:bucket){uint32_t old=v;v=sum;sum+=old;}scattering=true;radixAt=0;}}
    }else{
     while(radixAt<edges&&work){uint32_t index=order[radixAt++];temp[bucket[byteOf(index,radixPass)]++]=index;work--;}
     if(radixAt==edges){order.swap(temp);radixPass++;radixAt=0;scattering=false;std::fill(bucket,bucket+256,0);}
    }
   }else if(phase==14){
    while(at<edges&&work){total+=multiplicity[order[at++]];work--;}
    if(at==edges){phase=15;at=0;}
   }else if(phase==15){
    while(at<edges&&work){uint32_t i=order[at++];mass+=multiplicity[i];if(!weak&&mass>=.01*total)weak=difference[i];if(mass>=.5*total){median=difference[i];at=edges;}work--;}
    if(at==edges){phase=16;at=0;}
   }else if(phase==16){
    while(at<components&&work){minimum=std::min(minimum,levels[at]);maximum=std::max(maximum,levels[at]);at++;work--;}
    if(at==components){phase=17;}
   }else if(phase==17){
    // Output pointers survive until graph_destroy; scratch is no longer needed.
    std::vector<uint32_t>().swap(order);std::vector<uint32_t>().swap(temp);phase=18;
   }
  }
  return phase==18?1:0;
 }
};
extern "C" {
uintptr_t graph_create(uint32_t width,uint32_t height,const uint16_t*input){
 if(!width||!height||!input||uint64_t(width)*height>0x7fffffffULL||width>0x7fffffffU||height>0x7fffffffU)return 0;
 try{return reinterpret_cast<uintptr_t>(new Graph(width,height,input));}catch(...){return 0;}
}
void graph_destroy(Graph*p){delete p;}
int graph_step(Graph*p,uint32_t work){try{return p->step(std::max(work,1U));}catch(const std::bad_alloc&){return -1;}catch(...){return -2;}}
const double*graph_info(Graph*p){p->info[0]=p->phase;p->info[1]=p->n;p->info[2]=p->components;p->info[3]=p->edges;p->info[4]=p->median;p->info[5]=p->weak;p->info[6]=p->minimum;p->info[7]=p->maximum;return p->info;}
const void*graph_array(Graph*p,int field){switch(field){case 0:return p->source.data();case 1:return p->labels.data();case 2:return p->levels.data();case 3:return p->nativeLevels.data();case 4:return p->counts.data();case 5:return p->area.data();case 6:return p->low.data();case 7:return p->high.data();case 8:return p->difference.data();case 9:return p->multiplicity.data();default:return nullptr;}}
}

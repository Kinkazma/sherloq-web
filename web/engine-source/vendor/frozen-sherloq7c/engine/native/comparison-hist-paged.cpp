#include <emscripten.h>
#include <algorithm>
#include <array>
#include <vector>
#include <memory>
#include <cmath>
#include <cfloat>
#include <cstdint>
#include <stdexcept>
#include <cstring>
constexpr int BINS=1<<24;
EM_ASYNC_JS(int,histIO,(int id,int offset,int length,void* pointer,int write),{try{await Module.io(id,offset,length,pointer,write);return 0;}catch(e){Module.ioError=e;return 1;}});
EM_ASYNC_JS(int,histCheck,(),{try{await Module.checkpoint();return 0;}catch(e){Module.ioError=e;return 1;}});
static void check(){if(histCheck())throw std::runtime_error("Histogram operation stopped");}
class Counts {
 struct Slot {int page=-1;bool dirty=false;};int id,perPage,slots;bool resident;std::vector<uint32_t> data;std::vector<Slot> tags;
 void save(int s){if(tags[s].dirty){if(histIO(id,tags[s].page*perPage*4,perPage*4,data.data()+size_t(s)*perPage,1))throw std::runtime_error("Histogram write failed");tags[s].dirty=false;}}
 uint32_t&at(int i,bool write){if(resident)return data[i];int page=i/perPage,s=page%slots;if(tags[s].page!=page){save(s);if(histIO(id,page*perPage*4,perPage*4,data.data()+size_t(s)*perPage,0))throw std::runtime_error("Histogram read failed");tags[s].page=page;}tags[s].dirty|=write;return data[size_t(s)*perPage+i%perPage];}
 public:Counts(int id,bool resident,int bytes,int slots):id(id),perPage(bytes/4),slots(slots),resident(resident),data(resident?BINS:size_t(perPage)*slots),tags(resident?0:slots){}
 uint32_t get(int i){return at(i,false);}void add(int i,uint32_t n){auto&x=at(i,true);if(uint64_t(x)+n>INT32_MAX)throw std::runtime_error("Histogram count exceeds supported source size");x+=n;}
};
static std::unique_ptr<Counts> counts[2];static bool resident;static std::array<double,8> results;
template<class Next>static double pairwise(size_t n,Next&next){if(n<8){double s=-0.;for(size_t i=0;i<n;i++)s+=next();return s;}if(n<=128){double r[8];for(int j=0;j<8;j++)r[j]=next();size_t i=8;for(;i<n-n%8;i+=8)for(int j=0;j<8;j++)r[j]+=next();double s=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)s+=next();return s;}size_t cut=n/2;cut-=cut%8;double left=pairwise(cut,next),right=pairwise(n-cut,next);return left+right;}
extern "C" {
int comparison_hist_create(int memory,int pageBytes,int slots){try{if(pageBytes<512||pageBytes%4||((BINS*4)%pageBytes)||slots<1)return 1;resident=memory;counts[0]=std::make_unique<Counts>(0,memory,pageBytes,slots);counts[1]=std::make_unique<Counts>(1,memory,pageBytes,slots);return 0;}catch(...){counts[0].reset();counts[1].reset();return 1;}}
int comparison_hist_push(int side,const unsigned char*rgb,int n,char*error){try{if(side<0||side>1||n<1||n>262144||!counts[side])throw std::runtime_error("Invalid histogram input");auto&c=*counts[side];auto bin=[&](int i){auto*p=rgb+size_t(i)*3;return (int(p[2])<<16)|(int(p[1])<<8)|p[0];};if(resident){for(int i=0;i<n;i++){if((i&4095)==0)check();c.add(bin(i),1);}}
 else{std::vector<int> keys(n);for(int i=0;i<n;i++)keys[i]=bin(i);uint32_t tick=0;std::sort(keys.begin(),keys.end(),[&](int a,int b){if((tick++&65535)==0)check();return a<b;});for(int i=0;i<n;){if((i&4095)==0)check();int j=i+1;while(j<n&&keys[j]==keys[i])j++;c.add(keys[i],j-i);i=j;}}return 0;
 }catch(const std::exception&e){std::strncpy(error,e.what(),1023);error[1023]=0;return 1;}}
int comparison_hist_finish(char*error){try{auto&a=*counts[0];auto&b=*counts[1];uint32_t maximum=0;size_t nz=0,positive=0;for(int i=0;i<BINS;i++){if((i&65535)==0)check();auto x=a.get(i),y=b.get(i);maximum=std::max({maximum,x,y});nz+=bool(x||y);positive+=bool(x);}
 if(maximum<16777216){double sa=0,sb=0,aa=0,bb=0,ab=0,chi=0,alt=0,intersection=0,kl=0,bhat[2]={0,0};for(int i=0;i<BINS;i++){if((i&65535)==0)check();const float xf=a.get(i),yf=b.get(i);const double x=xf,y=yf,d=xf-yf,sum=xf+yf;sa+=x;sb+=y;aa+=x*x;bb+=y*y;ab+=x*y;if(x>0){chi+=d*d/x;kl+=x*std::log(x/(y>0?y:1e-10));}if(sum>0)alt+=d*d/sum;intersection+=std::min(x,y);bhat[i%2]+=std::sqrt(x*y);}
 auto correlation=[&](double bins){double scale=1./bins,num=ab-sa*sb*scale,den=(aa-sa*sa*scale)*(bb-sb*sb*scale);return std::abs(den)>DBL_EPSILON?num/std::sqrt(den):1.;};results={correlation(65536),chi,alt*2,intersection,std::sqrt(std::max(std::fma(-(bhat[0]+bhat[1]),std::abs(sa*sb)>FLT_EPSILON?1./std::sqrt(sa*sb):1.,1.),0.)),kl,correlation(BINS),65536};
 }else{double aa=0,bb=0,ab=0;for(int i=0;i<BINS;i++){if((i&65535)==0)check();double x=a.get(i),y=b.get(i);if(x||y){aa+=x*x;bb+=y*y;ab+=x*y;}}
 auto reduce=[&](int kind){int cursor=0;auto next=[&](){for(;;){int i=cursor++;if((i&65535)==0)check();double x=a.get(i),y=b.get(i);if((kind==2||kind==6)?x==0:x==0&&y==0)continue;double d=x-y;switch(kind){case 0:return x;case 1:return y;case 2:return d*d/x;case 3:return d*d/(x+y);case 4:return std::min(x,y);case 5:return std::sqrt(x*y);default:return x*std::log(x/(y>0?y:1e-10));}}};return pairwise(kind==2||kind==6?positive:nz,next);};
 double sa=reduce(0),sb=reduce(1),den=(aa-sa*sa/BINS)*(bb-sb*sb/BINS),correlation=den>0?(ab-sa*sb/BINS)/std::sqrt(den):1.;results={correlation,reduce(2),2*reduce(3),reduce(4),std::sqrt(std::max(1.-reduce(5)/std::sqrt(sa*sb),0.)),reduce(6),correlation,BINS};
 }return 0;}catch(const std::exception&e){std::strncpy(error,e.what(),1023);error[1023]=0;return 1;}}
const double* comparison_hist_values(){return results.data();}
void comparison_hist_release(){counts[0].reset();counts[1].reset();}
}

// Development arithmetic port of the pinned OpenBLAS ARMV8 routines.
// See OPENBLAS-SOURCES.json and OPENBLAS-NOTICES.txt. Not runtime.
// Only the native EM dimensions p=8/24 are supported. Serial/parallel refer to
// the oracle arithmetic order, never a browser calibration or worker policy.
#include <cmath>
#include <algorithm>
#include <vector>
static void lower(const double* a,double* b,int n,int first,int last,int cols,int stride){
 for(int at=first;at<last;at+=8){const int end=std::min(last,at+8);
  for(int row=at;row<end;row++)for(int col=0;col<cols;col++){double sum=0;for(int k=first;k<at;k++)sum=std::fma(a[row*n+k],b[k*stride+col],sum);b[row*stride+col]-=sum;}
  for(int i=at;i<end;i++)for(int col=0;col<cols;col++){double value=b[i*stride+col];for(int k=i+1;k<end;k++)b[k*stride+col]-=value*a[k*n+i];}
 }
}
static void upper(const double* a,double* b,int n){
 for(int end=n;end>0;end-=8){const int at=std::max(0,end-8);
  for(int row=at;row<end;row++)for(int col=0;col<n;col++){double sum=0;for(int k=end;k<n;k++)sum=std::fma(a[row*n+k],b[k*n+col],sum);b[row*n+col]-=sum;}
  for(int i=end-1;i>=at;i--){double inverse=1/a[i*n+i];for(int col=0;col<n;col++){double value=b[i*n+col]*inverse;b[i*n+col]=value;for(int k=at;k<i;k++)b[k*n+col]-=value*a[k*n+i];}}
 }
}
static int lu(double* a,int p,std::vector<int>& piv,int offset,int n,bool parallel=false){
 // GETRF_SINGLE stops at 8 columns; GESV parallel stops at 4. With the
 // pinned ten-thread reference its later panels have width 4 (FORMULA2).
 int blocking=((n/2+3)/4)*4,info=0;
 if(blocking<=(parallel?4:8)){
  for(int j=offset;j<offset+n;j++){
   for(int i=offset;i<j;i++)if(piv[i]!=i)std::swap(a[i*p+j],a[piv[i]*p+j]);
   for(int i=offset+1;i<j;i++){double sum=0;for(int k=offset;k<i;k++)sum=std::fma(a[i*p+k],a[k*p+j],sum);a[i*p+j]-=sum;}
   for(int k=offset;k<j;k++)for(int row=j;row<p;row++)a[row*p+j]=std::fma(-a[k*p+j],a[row*p+k],a[row*p+j]);
   int pivot=j;for(int row=j+1;row<p;row++)if(std::abs(a[row*p+j])>std::abs(a[pivot*p+j]))pivot=row;piv[j]=pivot;
   double value=a[pivot*p+j];if(value!=0){if(std::abs(value)>=0x1p-1022){double inverse=1/value;if(pivot!=j)for(int k=offset;k<=j;k++)std::swap(a[j*p+k],a[pivot*p+k]);for(int row=j+1;row<p;row++)a[row*p+j]*=inverse;}}else if(!info)info=j+1;
  }return info;
 }
 for(int j=offset;j<offset+n;){int count=std::min(parallel&&j>offset?4:blocking,offset+n-j);int code=lu(a,p,piv,j,count,parallel&&j==offset);if(code&&!info)info=code;
  if(j+count<offset+n){for(int col=j+count;col<offset+n;col++)for(int i=j;i<j+count;i++)if(piv[i]!=i)std::swap(a[i*p+col],a[piv[i]*p+col]);
   lower(a,a+j+count,p,j,j+count,offset+n-j-count,p);
   for(int row=j+count;row<p;row++)for(int col=j+count;col<offset+n;col++){double sum=0;for(int k=j;k<j+count;k++)sum=std::fma(a[row*p+k],a[k*p+col],sum);a[row*p+col]-=sum;}
  }
  j+=count;
 }
 for(int j=offset;j<offset+n;){int count=std::min(parallel&&j>offset?4:blocking,offset+n-j);for(int i=j+count;i<offset+n;i++)if(piv[i]!=i)for(int col=j;col<j+count;col++)std::swap(a[i*p+col],a[piv[i]*p+col]);j+=count;}return info;
}
extern "C" {
void em_blas_gram(const double* f,const double* w,double* out,int n,int p){
 for(int y=0;y<p;y++)for(int x=0;x<p;x++){double value=0;for(int at=0;at<n;){int count=n-at;if(count>=256)count=128;else if(count>128)count=(1LL*n*p*p>262144?(count+1)/2:((count/2+7)/8)*8);double sum=0;for(int k=at;k<at+count;k++){double a=(f[k*p+y]*w[k])*w[k];sum=std::fma(a,f[k*p+x],sum);}value+=sum;at+=count;}out[y*p+x]=value;}
}
int em_blas_lu(const double* matrix,double* out,int* pivot,int p){std::copy(matrix,matrix+p*p,out);std::vector<int> piv(p);int info=lu(out,p,piv,0,p);std::copy(piv.begin(),piv.end(),pivot);return info;}
int em_blas_inverse(const double* matrix,double* out,int p){std::vector<double>a(matrix,matrix+p*p);std::vector<int>piv(p);int info=lu(a.data(),p,piv,0,p,true);if(info)return info;std::fill(out,out+p*p,0);for(int i=0;i<p;i++)out[i*p+i]=1;for(int i=0;i<p;i++)if(piv[i]!=i)for(int col=0;col<p;col++)std::swap(out[i*p+col],out[piv[i]*p+col]);lower(a.data(),out,p,0,p,p,p);upper(a.data(),out,p);return 0;}
void em_blas_product(const double* inverse,const double* f,double* out,int n,int p){for(int i=0;i<p;i++)for(int row=0;row<n;row++){double sum=0;for(int k=0;k<p;k++)sum=std::fma(inverse[i*p+k],f[row*p+k],sum);out[i*n+row]=sum;}}
void em_blas_vector(const double* matrix,const double* vector,double* out,int n,int p){
 for(int row=0;row<p;row++){const double* a=matrix+row*n;double lanes[8]={};int i=0;for(;i+31<n;i+=32)for(int k=0;k<32;k++)lanes[k%8]=std::fma(a[i+k],vector[i+k],lanes[k%8]);double l=((lanes[0]+lanes[2])+lanes[4])+lanes[6],r=((lanes[1]+lanes[3])+lanes[5])+lanes[7];for(;i+3<n;i+=4){l=std::fma(a[i],vector[i],l);r=std::fma(a[i+1],vector[i+1],r);l=std::fma(a[i+2],vector[i+2],l);r=std::fma(a[i+3],vector[i+3],r);}double sum=l+r;for(;i<n;i++)sum=std::fma(a[i],vector[i],sum);out[row]=sum;}
}
}
extern "C" void em_blas_lower(const double*a,double*b,int n){lower(a,b,n,0,n,n,n);}
extern "C" void em_blas_upper(const double*a,double*b,int n){upper(a,b,n);}
extern "C" int em_blas_lu_parallel(const double* matrix,double* out,int* pivot,int p){std::copy(matrix,matrix+p*p,out);std::vector<int> piv(p);int info=lu(out,p,piv,0,p,true);std::copy(piv.begin(),piv.end(),pivot);return info;}

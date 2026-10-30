#include <cstdint>
#include <cstddef>
#include <cmath>
#include <limits>

static bool overlaps(const void*a,uint64_t an,const void*b,uint64_t bn){
 if(!a||!b||!an||!bn)return false;
 const uint64_t x=(uintptr_t)a,y=(uintptr_t)b;
 return x<y+bn&&y<x+an;
}

// Indices and binary64 coefficients are produced by the existing JavaScript
// ssgResizeCoefficients. This function creates no resize kernel or coefficients.
// Each pixel retains the literal j-then-i multiply/add order of project().
extern "C" int ssg_project_rows(
 const uint8_t*mask,const uint8_t*direct,const uint8_t*candidates,
 int sourceWidth,int sourceHeight,
 const uint32_t*xOffsets,const uint32_t*xIds,const double*xWeights,uint32_t xCount,
 const uint32_t*yOffsets,const uint32_t*yIds,const double*yWeights,uint32_t yCount,
 const uint8_t*admitted,int width,int height,int firstRow,int rows,
 uint8_t*outMask,uint8_t*outSupport){
 if(!mask||!direct||!candidates||!xOffsets||!xIds||!xWeights||!yOffsets||!yIds||!yWeights||!admitted||!outMask||!outSupport||
    sourceWidth<1||sourceHeight<1||width<1||height<1||firstRow<0||rows<1||firstRow>height||rows>height-firstRow)return -1;
 const uint64_t sourcePixels=(uint64_t)sourceWidth*sourceHeight,pixels=(uint64_t)width*height;
 if(sourcePixels>std::numeric_limits<int32_t>::max()||pixels>std::numeric_limits<int32_t>::max())return -1;
 if(xOffsets[0]||yOffsets[0]||xOffsets[width]!=xCount||yOffsets[height]!=yCount)return -1;
 for(int x=0;x<width;x++)if(xOffsets[x]>xOffsets[x+1]||xOffsets[x+1]>xCount)return -1;
 for(int y=0;y<height;y++)if(yOffsets[y]>yOffsets[y+1]||yOffsets[y+1]>yCount)return -1;
 for(uint32_t i=0;i<xCount;i++)if(xIds[i]>=(uint32_t)sourceWidth)return -1;
 for(uint32_t i=0;i<yCount;i++)if(yIds[i]>=(uint32_t)sourceHeight)return -1;
 const void*inputs[]={mask,direct,candidates,xOffsets,xIds,xWeights,yOffsets,yIds,yWeights,admitted};
 const uint64_t sizes[]={sourcePixels,sourcePixels,sourcePixels,((uint64_t)width+1)*4,(uint64_t)xCount*4,(uint64_t)xCount*8,((uint64_t)height+1)*4,(uint64_t)yCount*4,(uint64_t)yCount*8,pixels};
 if(overlaps(outMask,pixels,outSupport,pixels))return -1;
 for(size_t k=0;k<sizeof(inputs)/sizeof(inputs[0]);k++)if(overlaps(outMask,pixels,inputs[k],sizes[k])||overlaps(outSupport,pixels,inputs[k],sizes[k]))return -1;
 for(int y=firstRow;y<firstRow+rows;y++)for(int x=0;x<width;x++){
  const size_t at=(size_t)y*width+x;
  outMask[at]=0;outSupport[at]=0;
  if(!admitted[at])continue;
  double value=0,weight=0,supported=0;bool all=true;
  for(uint32_t j=yOffsets[y];j<yOffsets[y+1];j++)for(uint32_t i=xOffsets[x];i<xOffsets[x+1];i++){
   const size_t id=(size_t)yIds[j]*sourceWidth+xIds[i];
   const double w=yWeights[j]*xWeights[i];
   // Even zero weights retain their candidate/all test and tap position.
   if(candidates[id]){value+=mask[id]*w;weight+=w;supported+=direct[id]*std::abs(w);}else all=false;
  }
  outMask[at]=(all?value:std::abs(weight)>1e-14?value/weight:0)>.5?1:0;
  outSupport[at]=supported>0?1:0;
 }
 return 0;
}

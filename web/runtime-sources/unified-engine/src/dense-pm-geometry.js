import "../../runtime-context.js?v=0.30.0";
const f=Math.fround,u32=4294967296;
const limbs=value=>[value%u32,Math.floor(value/u32)];
// The UI's compact axes are cumulative native pixel/half-pixel coordinates.
// Scaling those exact differences by two permits the native double geometric
// predicate to be evaluated as integer quarters, with no float32 substitute.
// Other API coordinate domains keep their existing native CPU implementation.
export function describeDensePmGeometry(width,height,{axes=null,gap=[0,0],minimum=5,radius=600}={}){
 if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||width*width+height*height>=0x7fffffff||!Array.isArray(gap)||gap.length!==2||![minimum,radius,...gap].every(Number.isFinite)||minimum<0||radius<minimum||radius>0x1fffffff||gap.some(v=>Math.abs(v)>0x1fffffff))return null;
 const min=f(minimum),max=f(radius),gx=f(gap[0]),gy=f(gap[1]);
 if(!axes&&gx===0&&gy===0&&max*max<=0xffffffff)return{mode:'pixel',uniformBytes:64,coordinateBytes:0,searchMax:max,lower:[Math.ceil(min*min),0],upper:[Math.floor(max*max),0]};
 if(axes&&(!Array.isArray(axes)||axes.length!==2)||!Number.isInteger(gx*2)||!Number.isInteger(gy*2))return null;
 const spans=[];
 for(let axis=0;axis<2;axis++){
  const length=axis?height:width,values=axes?.[axis];if(!values){if(axes)return null;spans.push(length-1);continue;}
  if(!(values instanceof Float32Array)||values.length!==length||!Number.isFinite(values[0]))return null;const origin=values[0];
  for(let i=0;i<length;i++){const value=values[i],scaled=(value-origin)*2;if(!Number.isFinite(value)||!Number.isSafeInteger(value*2)||!Number.isInteger(scaled)||scaled<0||scaled>2*(length-1)||i&&(value<values[i-1]||value-values[i-1]>1.0001))return null;}
  spans.push(f(values[length-1]-origin));
 }
 const removedX=f(width-1-spans[0]),removedY=f(height-1-spans[1]),searchMax=f(max+Math.max(f(Math.abs(gx)+removedX),f(Math.abs(gy)+removedY))),dx=spans[0]*2+Math.abs(gx*2),dy=spans[1]*2+Math.abs(gy*2),largest=dx*dx+dy*dy;
 if(!Number.isSafeInteger(largest)||largest>=Number.MAX_SAFE_INTEGER)return null;
 return{mode:'half',uniformBytes:112,coordinateBytes:(width+height)*4,searchMax,lower:limbs(Math.min(largest+1,Math.ceil(4*min*min))),upper:limbs(Math.min(largest,Math.floor(4*max*max))),gapX2:gx*2,gapY2:gy*2,largestQuarterDistance:largest};
}
export function createDensePmGeometryCoordinates(width,height,axes){
 const values=new Int32Array(width+height);let offset=0;for(let axis=0;axis<2;axis++){const length=axis?height:width,source=axes?.[axis],origin=source?.[0]??0;for(let i=0;i<length;i++)values[offset+i]=source?(source[i]-origin)*2:i*2;offset+=length;}return values;
}

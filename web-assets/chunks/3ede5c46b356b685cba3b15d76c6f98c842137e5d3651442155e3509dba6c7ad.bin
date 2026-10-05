import "../../runtime-context.js?v=0.14.5";
import {copyTypedArray,wasmAllocationFailure} from './allocation.js';
import {EngineError,requireValue,checkAbort,normalizeResourceError,resourceAllocationKind} from './errors.js';
import {denseDescriptorShape} from './dense-math.js';
import {denseSearchContexts} from './dense-profiles.js';

const bounds=polygon=>{
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const [x,y] of polygon){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
 return [x0,y0,x1,y1];
};
export function denseCrop(width,height,regions,support){
 requireValue(Number.isInteger(support)&&support>=2&&support<=32&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'Invalid dense crop dimensions.');
 denseSearchContexts(regions,false);
 if(!regions.length)return {x:0,y:0,width,height};
 const [a,b,c,d]=bounds(regions.flat());
 const x=Math.max(0,Math.floor(a)-3*support),y=Math.max(0,Math.floor(b)-3*support);
 const x1=Math.min(width,Math.ceil(c)+3*support+1),y1=Math.min(height,Math.ceil(d)+3*support+1);
 requireValue(x1>x&&y1>y,'Dense region is outside the image.');
 return {x,y,width:x1-x,height:y1-y};
}
export function denseDistancePolicy({radius=600,auto=false,compact=false}={},regions=[],compare=false){
 denseSearchContexts(regions,compare);
 requireValue(Number.isFinite(radius)&&radius>=0&&typeof auto==='boolean'&&typeof compact==='boolean','Invalid dense distance policy.');
 const boxes=regions.map(bounds),gap=[0,0];
 if(compare&&compact)for(let axis=0;axis<2;axis++){
  const a=boxes[0],b=boxes[1];gap[axis]=b[axis]>a[axis+2]?Math.max(0,b[axis]-a[axis+2]-1):a[axis]>b[axis+2]?-Math.max(0,a[axis]-b[axis+2]-1):0;
 }
 const diagonal=b=>Math.sqrt((b[2]-b[0])**2+(b[3]-b[1])**2);
 const radii=boxes.length?boxes.map(b=>auto?Math.max(.01,diagonal(b)):radius):[radius];
 if(auto&&compare){const a=boxes[0],b=boxes[1];radius=Math.max(.01,diagonal([Math.min(a[0],b[0]-gap[0]),Math.min(a[1],b[1]-gap[1]),Math.max(a[2],b[2]-gap[0]),Math.max(a[3],b[3]-gap[1])]));}
 else if(auto&&regions.length)radius=radii.reduce((a,b)=>Math.max(a,b),0);
 return {radius,radii,gap};
}
export function denseCompactAxes(width,height,regions){
 denseSearchContexts(regions,false);requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'Invalid compact image dimensions.');
 if(!regions.length)return null;
 return [width,height].map((length,axis)=>{
  const occupied=new Uint8Array(length),values=new Float32Array(length);
  for(const polygon of regions){const box=bounds(polygon),lo=Math.max(0,Math.floor(box[axis])),hi=Math.min(length,Math.ceil(box[axis+2])+1);if(hi>lo)occupied.fill(1,lo,hi);}
  let sum=-1;for(let i=0;i<length;i++){sum+=occupied[i];values[i]=sum;}return values;
 });
}
export function denseCropAxes(axes,crop,width,height,shift){
 if(!axes)return null;
 return [width,height].map((length,axis)=>{
  const out=new Float32Array(length),values=axes[axis],origin=axis?crop.y:crop.x;
  for(let i=0;i<length;i++){const x=Math.max(0,Math.min(values.length-1,i+shift+origin)),lo=Math.floor(x),hi=Math.min(values.length-1,lo+1);out[i]=values[lo]+(values[hi]-values[lo])*(x-lo);}
  return out;
 });
}
export async function createDenseRegions(options={}){
 const {default:create}=await import('../vendor/dense-regions/dense-regions.js');let m;try{m=await create(options);}catch(error){const normalized=normalizeResourceError(error);if(normalized.code==='MEMORY_ALLOCATION'&&!resourceAllocationKind(normalized))normalized.details={...normalized.details,allocationKind:'wasm',operation:'dense-regions-init'};throw normalized;}
 return {
  get heapBytes(){return m.HEAPU8.byteLength;},
  renderer(image,points,pairs,colors,{stored=false}={}){
   const byteLength=image.width*image.height*3;
   requireValue(Number.isSafeInteger(byteLength)&&byteLength>0&&(stored?image.data===undefined:image.data instanceof Uint8Array&&image.data.length===byteLength)&&points instanceof Float32Array&&points.length%7===0&&pairs instanceof Float64Array&&pairs.length%4===0&&colors instanceof Uint8Array&&colors.length===pairs.length/4*3,'Invalid dense drawing data.');
   const pointers=[],allocate=n=>{const p=m._malloc(Math.max(8,n));if(!p)throw wasmAllocationFailure(m,'Dense drawing allocation failed.',Math.max(8,n));pointers.push(p);return p;},put=a=>{const p=allocate(a.byteLength);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};let disposed=false;
   try{const ip=stored?allocate(byteLength):put(image.data),pp=put(points),mp=put(pairs),cp=put(colors),rows=put(new Uint32Array(pairs.length/4)),base=put(new Uint8Array(3)),ap=put(new Float32Array(pairs.length/2)),bp=put(new Float32Array(pairs.length/2));
    return {
     overlap(a,b){requireValue(!disposed&&a.length===b.length&&a.length<=pairs.length/2,'Invalid dense hulls.');m.HEAPF32.set(a,ap/4);m.HEAPF32.set(b,bp/4);const value=m._sherloq_dense_overlap(ap,bp,a.length/2);if(value<0)throw new EngineError('GEOMETRY_FAILED','Dense hull intersection failed.');return value;},
     group(selected,color,flags){requireValue(!disposed&&selected.every(i=>i>=0&&i<pairs.length/4)&&color.length===3,'Invalid dense drawing group.');m.HEAPU8.set(new Uint8Array(Uint32Array.from(selected).buffer),rows);m.HEAPU8.set(color,base);if(!m._sherloq_dense_draw_group(ip,image.width,image.height,pp,mp,rows,selected.length,cp,base,flags))throw new EngineError('GEOMETRY_FAILED','Dense drawing failed.');},
     write(bytes,offset=0){requireValue(!disposed&&stored&&bytes instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset+bytes.length<=byteLength,'Invalid renderer input page.');m.HEAPU8.set(bytes,ip+offset);},
     pixels(offset=0,length=byteLength-offset){requireValue(!disposed&&Number.isSafeInteger(offset)&&Number.isSafeInteger(length)&&offset>=0&&length>=0&&offset+length<=byteLength,'Invalid renderer output page.');return copyTypedArray(m.HEAPU8.subarray(ip+offset,ip+offset+length),{label:'dense-regions-output'});},
     dispose(){if(disposed)return;disposed=true;for(const p of pointers)m._free(p);}
    };
   }catch(error){for(const p of pointers)m._free(p);throw error;}
  },
  guideLabels(points,width,height,guides){
   denseSearchContexts(guides);requireValue(points instanceof Float32Array&&points.length%7===0&&points.every(Number.isFinite)&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&guides.flat(2).every(x=>Math.abs(x)<0x3fffffff),'Invalid guide membership geometry.');const pointers=[],put=a=>{const p=m._malloc(Math.max(1,a.byteLength));if(!p)throw wasmAllocationFailure(m,'Guide membership allocation failed.',Math.max(1,a.byteLength));pointers.push(p);m.HEAPU8.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);return p;};
   try{const verts=Float64Array.from(guides.flat(2)),polys=new Int32Array(guides.length*2);let at=0;guides.forEach((g,i)=>{polys[i*2]=at;polys[i*2+1]=g.length;at+=g.length;});const pp=put(points),vp=put(verts),gp=put(polys),out=put(new Int32Array(points.length/7));if(!m._sherloq_dense_guide_labels(pp,points.length/7,width,height,vp,gp,guides.length,out))throw new EngineError('INVALID_INPUT','Guide membership failed.');return copyTypedArray(m.HEAP32.subarray(out/4,out/4+points.length/7),{label:'dense-regions-output'});}finally{for(const p of pointers)m._free(p);}
  },
  detail(image){
   const {width,height,data}=image;requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>1&&height>1&&data instanceof Uint8Array&&data.length===width*height*3,'Invalid dense detail image.');let src=0,out=0;try{src=m._malloc(data.byteLength);out=m._malloc(width*height*4);if(!src||!out)throw wasmAllocationFailure(m,'Dense detail allocation failed.',undefined);m.HEAPU8.set(data,src);if(!m._sherloq_dense_detail(src,width,height,out))throw new EngineError('INVALID_INPUT','Dense detail failed.');return {width,height,values:copyTypedArray(m.HEAPF32.subarray(out/4,out/4+width*height),{label:'dense-regions-output'})};}finally{if(src)m._free(src);if(out)m._free(out);}
  },
  sampler(detail){
   requireValue(Number.isSafeInteger(detail.width)&&Number.isSafeInteger(detail.height)&&detail.width>1&&detail.height>1&&detail.values instanceof Float32Array&&detail.values.length===detail.width*detail.height,'Invalid detail source.');const pointers=[];let disposed=false;
   try{for(const bytes of [detail.values.byteLength,2592*4,2592*4,2592*4]){const p=m._malloc(bytes);if(!p)throw wasmAllocationFailure(m,'Detail sample allocation failed.',bytes);pointers.push(p);}const [ip,xp,yp,out]=pointers;m.HEAPF32.set(detail.values,ip/4);
    return {sample(x,y,rows,cols){requireValue(!disposed&&rows*cols<=2592&&x.length===rows*cols&&y.length===x.length,'Invalid detail sample.');m.HEAPF32.set(x,xp/4);m.HEAPF32.set(y,yp/4);if(!m._sherloq_dense_remap(ip,detail.width,detail.height,xp,yp,rows,cols,out))throw new EngineError('INVALID_INPUT','Detail sampling failed.');return copyTypedArray(m.HEAPF32.subarray(out/4,out/4+rows*cols),{label:'dense-regions-output'});},dispose(){if(disposed)return;disposed=true;for(const p of pointers)m._free(p);}};
   }catch(error){for(const p of pointers)m._free(p);throw error;}
  },
  remap(detail,x,y,rows,cols){const sampler=this.sampler(detail);try{return sampler.sample(x,y,rows,cols);}finally{sampler.dispose();}},
  allowed(image,{method=0,patch=8,targetPatch=patch,regions=[],excluded=[],texture=2,signal,destination}={}){
   const {width,height,data}=image,support=Math.max(patch,targetPatch),shape=denseDescriptorShape(width,height,method,support);
   requireValue(data instanceof Uint8Array&&data.length===width*height*3&&regions.length<=2&&Number.isFinite(texture)&&texture>=0,'Invalid dense eligibility source.');
   denseSearchContexts(regions,false);denseSearchContexts(excluded,false);checkAbort(signal);
   const paths=[...regions,...excluded],count=paths.reduce((n,p)=>n+p.length,0),pointers=[];
   const reserve=n=>{const p=m._malloc(Math.max(1,n));if(!p)throw new EngineError('MEMORY_ALLOCATION','Dense mask allocation failed.',{details:{allocationKind:'wasm',requestedBytes:Math.max(1,n),currentBytes:m.HEAPU8.byteLength,operation:'dense-mask-malloc'}});pointers.push(p);return p;};
   try{
    const source=reserve(data.byteLength),points=reserve(count*16),polygons=reserve(paths.length*8),out=reserve(shape.width*shape.height),error=reserve(1024);
    m.HEAPU8.set(data,source);let point=0;
    paths.forEach((poly,i)=>{m.HEAP32[polygons/4+2*i]=point;m.HEAP32[polygons/4+2*i+1]=poly.length;for(const [x,y] of poly){requireValue(Math.abs(x)<0x3fffffff&&Math.abs(y)<0x3fffffff,'Polygon coordinate exceeds native addressing.');m.HEAPF64[points/8+2*point]=x;m.HEAPF64[points/8+2*point+1]=y;point++;}});
    const code=m._sherloq_dense_allowed(source,width,height,shape.width,shape.height,shape.shift,patch,texture,points,polygons,paths.length,regions.length,out,error);
    if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);
    if(destination){const {data,x=0,y=0,width:coreWidth=shape.width,height:coreHeight=shape.height}=destination;requireValue(data instanceof Uint8Array&&Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&Number.isSafeInteger(coreWidth)&&Number.isSafeInteger(coreHeight)&&x>=0&&y>=0&&coreWidth>0&&coreHeight>0&&x+coreWidth<=shape.width&&y+coreHeight<=shape.height&&data.length>=coreWidth*coreHeight,'Invalid dense mask destination.');for(let row=0;row<coreHeight;row++)data.set(m.HEAPU8.subarray(out+(y+row)*shape.width+x,out+(y+row)*shape.width+x+coreWidth),row*coreWidth);return {...shape,mask:data.subarray(0,coreWidth*coreHeight)};}
    return {...shape,mask:copyTypedArray(m.HEAPU8.subarray(out,out+shape.width*shape.height),{label:'dense-regions-output'})};
   }finally{for(const p of pointers)m._free(p);}
  },
 };
}

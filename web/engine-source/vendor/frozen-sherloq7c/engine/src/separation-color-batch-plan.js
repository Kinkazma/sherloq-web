import {requireValue} from './errors.js';
const align=(n,a)=>Math.ceil(n/a)*a;
// Independent windows retain independent shader address spaces. No image atlas.
export function planSeparationColorBatch(shapes,{limits={},availableBytes=Infinity,maxEntries=32}={}){
 requireValue(Array.isArray(shapes)&&shapes.length>0&&shapes.length<=maxEntries&&maxEntries<=32,'Bounded colour windows required');
 const storage=limits.minStorageBufferOffsetAlignment??256,uniform=limits.minUniformBufferOffsetAlignment??256;
 let source=0,output=0,mask=0,shape=0,read=0,rgb=0,native=0,maximumRgb=0;const entries=[];
 for(const s of shapes){const {width:w,height:h,start,rows}=s,n=w*h,total=w*rows;
  requireValue([w,h,start,rows,n,total].every(Number.isSafeInteger)&&w>0&&h>0&&start>=0&&rows>0&&start+rows<=h,'Invalid colour window shape');
  source=align(source,storage);output=align(output,storage);mask=align(mask,storage);shape=align(shape,uniform);
  const e={index:entries.length,width:w,height:h,start,rows,sourceOffset:source,sourceBytes:n*4,outputOffset:output,outputBytes:total*4,maskOffset:mask,maskBytes:s.membership?align(n,4):4,shapeOffset:shape,readOffset:read,rgbBytes:total*3,membership:!!s.membership};entries.push(e);
  source+=e.sourceBytes;output+=e.outputBytes;mask+=e.maskBytes;shape+=32;read+=e.outputBytes;rgb+=e.rgbBytes;native+=n*4+total*7;maximumRgb=Math.max(maximumRgb,n*3);
 }
 const buffers={source,output,mask,shape,read,scratch:4,table:4},gpuBytes=Object.values(buffers).reduce((a,b)=>a+b,0),mappedBytes=read,metadataBytes=entries.length*1024;
 const binding=Math.min(limits.maxStorageBufferBindingSize??Infinity,limits.maxBufferSize??Infinity);
 if(Object.values(buffers).some(n=>n>binding)||native+maximumRgb>32*1024**2||gpuBytes+mappedBytes+rgb+metadataBytes>availableBytes)return null;
 return Object.freeze({entries:Object.freeze(entries.map(Object.freeze)),buffers:Object.freeze(buffers),gpuBytes,mappedBytes,outputBytes:rgb,metadataBytes,nativeBytes:native+maximumRgb});
}
export function* groupSeparationColorCores(cores,{enabled=false,maxEntries=32}={}){
 requireValue(Number.isSafeInteger(maxEntries)&&maxEntries>0&&maxEntries<=32,'Invalid colour group bound');let group=[];
 for(const core of cores){if(!enabled){yield[core];continue;}group.push(core);if(group.length===maxEntries){yield group;group=[];}}
 if(group.length)yield group;
}

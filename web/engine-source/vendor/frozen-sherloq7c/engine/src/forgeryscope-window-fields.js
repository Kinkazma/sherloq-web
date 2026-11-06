import{requireValue,checkAbort,controlCheckpoint}from'./errors.js';
export const FORGERYSCOPE_WINDOW_FIELDS=Object.freeze(['mask','map','candidates','geometric','branch_microscopy','branch_blots','branch_lanes']);
/** Only presentation unions candidate members of these completed fields. The
 * certified fragments are the exact half-open admitted candidate union; native
 * hull rasterizers can paint their integer boundary beyond that union. Complete
 * per-window native fields remain borrowed and independently identifiable. */
export function forgeryscopeWindowFields(windows,{width,height,origin,budget,alive}={}){
 const length=width*height;requireValue(Number.isSafeInteger(length)&&length>0&&Array.isArray(origin)&&origin.length===2,'Forgeryscope presentation frame required.');
 return Object.fromEntries(FORGERYSCOPE_WINDOW_FIELDS.map(name=>{
  const Type=name==='map'?Float32Array:Uint8Array,bpp=Type.BYTES_PER_ELEMENT;
  const field={length,byteLength:length*bpp,elementType:Type.name,BYTES_PER_ELEMENT:bpp,storage:'borrowed-native-windows',
   async readInto(target,offset=0,{signal}={}){
    checkAbort(signal);alive();requireValue(target instanceof Type&&Number.isSafeInteger(offset)&&offset>=0&&offset<=length-target.length,'Invalid Forgeryscope window field range.');target.fill(0);
    for(const window of windows){if(window.status==='empty')continue;const raw=window.output,source=raw[name],[ox,oy]=window.origin.map((v,i)=>v-origin[i]);
     requireValue(Number.isSafeInteger(ox)&&Number.isSafeInteger(oy)&&source?.length===raw.width*raw.height&&source.elementType===Type.name&&typeof source.readInto==='function','Native Forgeryscope field dimensions/type changed.');
     const fragments=raw.metadata?.strict_native_contexts?.fragments;
     requireValue(Array.isArray(fragments)&&fragments.length>0&&fragments.every(f=>Array.isArray(f.bounds)&&f.bounds.length===4&&f.bounds.every(Number.isSafeInteger)&&f.bounds[0]>=0&&f.bounds[1]>=0&&f.bounds[0]<f.bounds[2]&&f.bounds[1]<f.bounds[3]&&f.bounds[2]<=raw.width&&f.bounds[3]<=raw.height),'Exact certified native Forgeryscope candidate fragments required for presentation.');
     for(const fragment of fragments){
      const [left,top,right,bottom]=fragment.bounds,x0=Math.max(0,ox+left),x1=Math.min(width,ox+right),y0=Math.max(0,oy+top,Math.floor(offset/width)),y1=Math.min(height,oy+bottom,Math.ceil((offset+target.length)/width));if(x1<=x0||y1<=y0)continue;
      const free=budget.reserve((x1-x0)*bpp);try{const scratch=new Type(x1-x0);for(let y=y0;y<y1;y++){await controlCheckpoint(signal);alive();const a=Math.max(offset,y*width+x0),b=Math.min(offset+target.length,y*width+x1);if(b<=a)continue;const row=scratch.subarray(0,b-a);await source.readInto(row,(y-oy)*raw.width+a-y*width-ox,{signal});checkAbort(signal);alive();for(let i=0;i<row.length;i++){const at=a-offset+i;target[at]=name==='map'?Math.max(target[at],row[i]):target[at]|row[i];}}}finally{free();}
     }
    }checkAbort(signal);alive();return target;
   },
   async readBytes(target,offset=0,{signal}={}){
    checkAbort(signal);alive();requireValue(target instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset<=length*bpp-target.length,'Invalid Forgeryscope window byte range.');if(bpp===1)return field.readInto(target,offset,{signal});
    for(let at=0;at<target.length;){const absolute=offset+at,first=Math.floor(absolute/bpp),skip=absolute%bpp,count=Math.min(262144,target.length-at),elements=Math.ceil((skip+count)/bpp),free=budget.reserve(elements*bpp);try{const values=new Type(elements);await field.readInto(values,first,{signal});target.set(new Uint8Array(values.buffer,skip,count),at);}finally{free();}at+=count;}checkAbort(signal);alive();return target;
   }
  };return[name,Object.freeze(field)];
 }));
}

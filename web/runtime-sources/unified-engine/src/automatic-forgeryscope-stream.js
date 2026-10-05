import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {automaticAiSelection,localAiExclusions} from './automatic-ai-regions.js';
import {createSegmentedBytes} from './segmented-bytes.js';
const MiB=1024**2,FIELDS=['mask','map','candidates','geometric','branch_microscopy','branch_blots','branch_lanes'],bytesOf=value=>JSON.stringify(value).length*4+8192;

// The M2 source analyzer requests one admitted crop. Preserve native black-input
// exclusions through a translated view, without retaining another RGB copy.
export function automaticForgeryscopeCropSurface(image,box,excluded){
 const [x,y,r,b]=box,width=r-x,height=b-y,local=localAiExclusions(box,excluded),original=image.surface.descriptor;
 return {sha256:image.sha256,exclusions:local,surface:{descriptor:{id:original.id+'/automatic-forgeryscope/'+JSON.stringify([box,local]),revision:original.revision,width,height,format:'rgb8'},
  async readWindow(rect={x:0,y:0,width,height},hooks={}){
   requireValue([rect.x,rect.y,rect.width,rect.height].every(Number.isInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=width&&rect.y+rect.height<=height,'Invalid Forgeryscope crop window');
   const lease=await image.surface.readWindow({...rect,x:x+rect.x,y:y+rect.y},hooks),cooperate=createCooperator(hooks.signal);
   try{for(const [a,c,d,e]of local){const x0=Math.max(a,rect.x)-rect.x,x1=Math.min(d,rect.x+rect.width)-rect.x,y0=Math.max(c,rect.y)-rect.y,y1=Math.min(e,rect.y+rect.height)-rect.y;if(x1<=x0||y1<=y0)continue;for(let row=y0;row<y1;row++){if(row%64===0)await cooperate();lease.pixels.data.fill(0,(row*rect.width+x0)*3,(row*rect.width+x1)*3);}}checkAbort(hooks.signal);return lease;}catch(error){lease.release();throw error;}
  }} };
}

/** Global scientific assembly over real M2 source fields. Coordinates, black
 * exclusions, union rules and crop metadata match clone_detectors. */
export async function streamedAutomaticForgeryscope(image,plan,{analyzer,budget,signal,onProgress}={}){
 const {width,height}=plan,job=plan.jobs.find(j=>j.id==='forgeryscope'),{boxes,excluded}=automaticAiSelection(width,height,job.params),n=width*height,stores={},leases=[],zones=[],providers=[],metrics=[],cooperate=createCooperator(signal);let scratch,complete=false,disposal;requireValue(Number.isSafeInteger(n*11),'AI output size exceeds integer range');
 async function dispose(){return disposal??=(async()=>{const settled=await Promise.allSettled(Object.values(stores).map(s=>s.dispose()));for(const release of leases)release();const failed=settled.find(s=>s.status==='rejected');if(failed)throw failed.reason;})();}
 try{
  scratch=budget.reserve(8*MiB+width*8+8192);const outputBytes=new Uint8Array(Math.max(4*MiB,width*4)),inputBytes=new Uint8Array(outputBytes.length),rows=Math.max(1,Math.floor(MiB/width));
  for(const name of [...FIELDS,'analyzed'])stores[name]=await createSegmentedBytes(n*(name==='map'?4:1),{budget,signal,storage:image.session||image.ensureTemporarySession?'temporary':'auto',temporarySession:image.session,getTemporarySession:image.ensureTemporarySession});
  const report=(phase,fraction,detail={})=>{onProgress?.({...detail,group:'forgeryscope',phase,fraction});checkAbort(signal);};
  for(const [index,box]of boxes.entries()){
   const [x,y,r,b]=box,w=r-x,h=b-y,crop=automaticForgeryscopeCropSurface(image,box,excluded);let result;
   try{
    result=await analyzer.analyze(crop,{profile:'auto',exclusions:crop.exclusions},{signal,backend:plan.cpu?'cpu':'auto',onProgress:e=>report(e.phase,index/boxes.length,{...e,stageFraction:e.fraction})});
    checkAbort(signal);requireValue(result.width===w&&result.height===h&&FIELDS.every(k=>result[k]?.length===w*h&&result[k].elementType===(k==='map'?'Float32Array':'Uint8Array')&&typeof result[k].readBytes==='function'),'Segmented M2 fields must expose exact types and byte reads');
    for(let top=0;top<h;top+=rows){await cooperate();const count=Math.min(rows,h-top);
     for(const name of FIELDS){const Type=name==='map'?Float32Array:Uint8Array,bpp=Type.BYTES_PER_ELEMENT,output=outputBytes.subarray(0,width*count*bpp),input=inputBytes.subarray(0,w*count*bpp);await stores[name].readInto(output,(y+top)*width*bpp);await result[name].readBytes(input,top*w*bpp,{signal});const a=new Type(output.buffer,0,width*count),v=new Type(input.buffer,0,w*count);
      for(let row=0;row<count;row++)for(let col=0;col<w;col++){const at=row*width+x+col,value=v[row*w+col];a[at]=name==='map'?Math.max(a[at],value):a[at]|value;}
      await stores[name].write(output,(y+top)*width*bpp);
     }
     const analyzed=outputBytes.subarray(0,width*count);await stores.analyzed.readInto(analyzed,(y+top)*width);for(let row=0;row<count;row++)analyzed.fill(1,row*width+x,row*width+r);await stores.analyzed.write(analyzed,(y+top)*width);
    }
    const metadata={origin:[x,y],...result.metadata};leases.push(budget.reserve(bytesOf(metadata)+bytesOf(result.provenance)+bytesOf(result.metrics)));zones.push(structuredClone(metadata));providers.push(structuredClone(result.provenance));metrics.push(structuredClone(result.metrics));
   }finally{await result?.release();}
   report('zone-complete',(index+1)/boxes.length,{completed:index+1,total:boxes.length});
  }
  for(const [x,y,r,b]of excluded)for(let top=y;top<b;top+=rows){await cooperate();const count=Math.min(rows,b-top);for(const [name,store]of Object.entries(stores)){const bpp=name==='map'?4:1,part=outputBytes.subarray(0,width*count*bpp);await store.readInto(part,top*width*bpp);for(let row=0;row<count;row++)part.fill(0,(row*width+x)*bpp,(row*width+r)*bpp);await store.write(part,top*width*bpp);}}
  for(const store of Object.values(stores))await store.flush();
  async function any(store){for(let at=0;at<n;at+=MiB){await cooperate();const part=outputBytes.subarray(0,Math.min(MiB,n-at));await store.readInto(part,at);if(part.some(Boolean))return true;}return false;}
  const status=await any(stores.mask)?'ok':await any(stores.candidates)?'candidates':zones.every(z=>z.status==='no_panels')?'no_panels':zones.every(z=>['no_panels','insufficient_panels'].includes(z.status))?'insufficient_panels':'empty';
  checkAbort(signal);complete=true;return {width,height,layout:'segmented',stores,metadata:{method:'clone_detectors',variant:'Forgeryscope Auto',boxes,compare:false,zones,status,threshold:.5,probability_interpolation:'bilinear',mask_interpolation:'nearest',radius_supported:false,segmentation:false,result_storage:'segmented',...(excluded.length?{excluded_boxes:excluded}:{})},provenance:{providers,requested_backend:plan.cpu?'cpu':'auto',selection:'native-rectangular-independent-crops',exclusion_policy:'black-input-reject-touching-panels-and-mask-output'},metrics:{zones:metrics,preflightExecutions:0,memory:budget.snapshot()},release:dispose};
 }finally{scratch?.();if(!complete)await dispose();}
}

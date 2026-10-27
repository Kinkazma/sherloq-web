// Inputs express intent; only an acknowledged, painted native result advances playback.
// Repeated keydown events never become a queue of work after a held key is released.
export function createStepPlayback({step,canStep=()=>true,getInterval=()=>100,onError=()=>{},now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 const held=new Map(),queue=[],gates=new Set();let current=null,lastKey=null,lastPaint=null,closed=false,completed=0;
 function clearGates(){for(const gate of gates){cancel(gate.timer);gate.resolve();}gates.clear();}
 function wake(){
  if(closed||current||!canStep())return;
  while(!current){
   const request=queue.shift()??[...held.values()].at(-1);if(!request)return;
   const record={request,key:null};current=record;
   try{record.key=step(request.direction,request);}catch(error){reset();onError(error);return;}
   if(current!==record)return;
   if(record.key)return;
   current=null;if(request.id)held.delete(request.id);
  }
 }
 function reset(){held.clear();queue.length=0;current=null;lastKey=null;lastPaint=null;clearGates();}
 return {
  down(id,direction,{repeat=false,...data}={}){if(closed||repeat||held.has(id))return;const request={id,direction,...data};held.set(id,request);queue.push(request);wake();},
  up(id){held.delete(id);},
  once(direction,data={}){if(closed)return;queue.push({direction,...data});wake();},
  releaseAll(){held.clear();queue.length=0;},
  reset,wake,
  beforePublish(key){
   if(closed||current?.key!==key||lastPaint===null)return Promise.resolve();
   const delay=Math.max(0,lastPaint+getInterval()-now());if(!delay)return Promise.resolve();
   return new Promise(resolve=>{const gate={resolve,timer:null};gates.add(gate);gate.timer=schedule(()=>{gates.delete(gate);resolve();},delay);});
  },
  presented(key){
   if(closed)return;
   if(lastKey!==key){lastKey=key;lastPaint=now();}
   if(current?.key!==key){wake();return;}
   current=null;completed++;wake();
  },
  get busy(){return !!current||queue.length>0||held.size>0;},
  diagnostics(){return {held:held.size,queued:queue.length,waiting:current?.key??null,completed,lastPaint};},
  dispose(){closed=true;reset();}
 };
}

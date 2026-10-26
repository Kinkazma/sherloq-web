// A click is one requested native presentation, not a keyboard-repeat event.
// Only an acknowledgement from the current painted owner advances the queue.
export function createLoupeStepPlayback({step,canStep=()=>true,onError=()=>{},onChange=()=>{},schedule=setTimeout,cancel=clearTimeout,heldInterval=100}={}){
 if(typeof step!=='function')throw new TypeError('A step callback is required.');
 const queue=[],held=new Map();let current=null,closed=false,generation=0,completed=0,timer=null;
 const clearTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
 const publish=()=>onChange({busy:!!current||queue.length>0||held.size>0,queued:queue.length,completed});
 function reset(){generation++;clearTimer();held.clear();queue.length=0;current=null;publish();}
 function wake(){
  if(closed||current||!canStep())return;clearTimer();
  while((queue.length||held.size)&&!current){
   const request=queue.shift()??[...held.values()].at(-1),record={request,generation,token:null};current=record;
   try{
    const token=step(request.direction,request);
    if(current!==record||record.generation!==generation)return;
    if(token&&(!Object.hasOwn(token,'owner')||token.owner==null||typeof token.effectsKey!=='string'))throw new TypeError('A native presentation identity is required.');
    record.token=token;
    if(!token){current=null;if(request.id)held.delete(request.id);}
   }catch(error){reset();onError(error);return;}
  }
  publish();
 }
 return{
  down(id,direction,{repeat=false,...details}={}){if(closed||repeat||held.has(id)||!canStep())return false;if(direction!==-1&&direction!==1)throw new TypeError('Invalid step direction.');const request=Object.freeze({...details,id,direction});held.set(id,request);queue.push(request);wake();return true;},
  up(id){if(!held.delete(id))return false;if(!held.size)clearTimer();publish();return true;},
  once(direction,details={}){
   if(closed||!canStep())return false;
   if(direction!==-1&&direction!==1)throw new TypeError('A step direction must be -1 or 1.');
   queue.push(Object.freeze({...details,direction}));wake();return true;
  },
  presented(frame){
   if(closed||!current?.token||frame?.native===false)return false;
   const token=current.token;
   if(!Object.is(frame?.owner,token.owner)||frame.effectsKey!==token.effectsKey)return false;
   current=null;completed++;if(queue.length)wake();else if(held.size){const ticket=generation;timer=schedule(()=>{timer=null;if(ticket===generation)wake();},heldInterval);publish();}else publish();return true;
  },
  reset,wake,
  dispose(){if(closed)return;closed=true;reset();},
  get state(){return{closed,busy:!!current||queue.length>0||held.size>0,queued:queue.length,held:held.size,completed,waiting:current?.token??null,generation};}
 };
}

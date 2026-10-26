import {requireValue} from '../../src/errors.js';

// Additive owner for this new dot bank only. A refused queue, buffer, destroy
// or lost acknowledgement retains the device and admission for a real retry.
export function createCmsegWindowGpuOwner({isBusy=()=>false,onOwner}={}){
 const buffers=new Set();let device,credit,retiring,queueDone=false,destroyed=false,closed=false;
 const api={
  device(value){requireValue(!device&&!closed,'CMSeg GPU device already owned');device=value;return value;},
  credit(value){requireValue(!credit&&!closed&&typeof value==='function','CMSeg GPU credit already owned');credit=value;},
  buffer(value){requireValue(!closed,'CMSeg GPU owner closed');buffers.add(value);return value;},
  async dispose(){
   requireValue(!isBusy(),'CMSeg GPU dot is busy');if(retiring)return retiring;if(closed)return;
   retiring=(async()=>{
    if(device&&!queueDone){await device.queue.onSubmittedWorkDone();queueDone=true;}
    for(const b of buffers){await b.destroy();buffers.delete(b);}
    if(device&&!destroyed){await device.destroy();destroyed=true;}
    if(device)await device.lost;
    device=undefined;credit?.();credit=undefined;closed=true;
   })().finally(()=>retiring=undefined);return retiring;
  },
  get pendingACKs(){return buffers.size+(device?1:0)+(credit?1:0);},
  get closed(){return closed;}
 };
 onOwner?.(api);return api;
}

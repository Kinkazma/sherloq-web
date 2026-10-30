import {requireValue} from '../../src/errors.js';

// A rejected retirement is a debt, not a completed disposal. Only pending or
// refused owners are held strongly; a live checkpoint keeps its own children.
export function createGpuRetirementRegistry(){
 const pending=new Set(),entries=new WeakMap();
 const entry=value=>{
  requireValue(value&&typeof value.dispose==='function','GPU retirement owner');
  let record=entries.get(value);if(record)return record;
  const close=value.dispose.bind(value);let inflight,retired=false;
  record={get retired(){return retired;},retire(){
   if(inflight)return inflight;if(retired)return Promise.resolve();pending.add(record);
   const task=Promise.resolve().then(close);inflight=task;
   task.then(()=>{retired=true;pending.delete(record);if(inflight===task)inflight=null;},()=>{if(inflight===task)inflight=null;});
   return task;
  }};
  entries.set(value,record);value.dispose=()=>record.retire();return record;
 };
 const registry={
  async own(promise){const value=await promise;entry(value);return value;},
  async create(factory){
   await registry.close();let owner;
   const adopt=value=>{requireValue(!owner||owner===value,'Single GPU constructor owner');owner=value;entry(value);};
   try{const value=await factory(adopt);if(!owner)adopt(value);requireValue(value===owner,'GPU constructor owner identity');return value;}
   catch(error){if(owner&&!entry(owner).retired)pending.add(entry(owner));throw error;}
  },
  retire(value){return entry(value).retire();},
  async close(){const results=await Promise.allSettled([...pending].map(record=>record.retire()));for(const result of results)if(result.status==='rejected')throw result.reason;},
  get pending(){return pending.size;}
 };
 return registry;
}

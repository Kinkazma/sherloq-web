import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';
export const BACKING_KINDS=['array-buffer','wasm','gpu','gpu-mapped'];
const STATES=['ready','queued','compute','io','recovery','waiting-child'];
// Allocation-domain ownership supplements the total policy budget. It never
// charges a global reservation twice and never infers a browser pool ceiling.
export class ResourceRegistry {
 constructor(budget){this.budget=budget;this.backings=new Set();this.operations=new Map();this.waitingOperations=new Map();this.pressures=new Set();this.sequence=0;this.backingIdentities=new Map();this.backingSequence=0;this.pressureSequence=0;}
 registerBacking(kind,bytes,{owner='unattributed',label='',state='materialized',reclaimable=false,identity,operation}={}){
  requireValue(BACKING_KINDS.includes(kind)&&Number.isSafeInteger(bytes)&&bytes>=0&&typeof owner==='string'&&typeof label==='string'&&['reserved','materialized'].includes(state),'Invalid backing ownership.');
  requireValue(operation===undefined||this.has(operation),'Invalid backing operation.');
  let record=identity===undefined?undefined:this.backingIdentities.get(identity);
  if(record){requireValue(record.kind===kind&&record.bytes===bytes,'Aliased backing extent or domain differs.');record.aliases++;}
  else{record={id:++this.backingSequence,kind,bytes,materializedBytes:state==='materialized'?bytes:0,owner,label,reclaimable:!!reclaimable,pins:0,aliases:1,generation:0,operation:operation?.key??null};this.backings.add(record);if(identity!==undefined)this.backingIdentities.set(identity,record);}
  let closed=false,borrowed=0,backingIdentity=identity;identity=undefined;
  const release=()=>{if(closed)return;if(borrowed)throw new EngineError('BUSY','A backing owner cannot retire while its views are pinned.');closed=true;const retiredIdentity=backingIdentity;backingIdentity=undefined;const retired=--record.aliases===0;if(retired){this.backings.delete(record);if(retiredIdentity!==undefined)this.backingIdentities.delete(retiredIdentity);}this.budget.resourceChanged();return retired?record.materializedBytes:0;};
  release.materialize=(actualBytes=record.bytes)=>{requireValue(!closed&&Number.isSafeInteger(actualBytes)&&actualBytes>=0&&actualBytes<=record.bytes,'Invalid materialized extent.');record.materializedBytes=actualBytes;this.budget.resourceChanged();};
  release.resize=(actualBytes,{materializedBytes=actualBytes}={})=>{requireValue(!closed&&Number.isSafeInteger(actualBytes)&&actualBytes>=0&&Number.isSafeInteger(materializedBytes)&&materializedBytes>=0&&materializedBytes<=actualBytes,'Invalid backing resize.');if(record.pins)throw new EngineError('BUSY','A pinned backing cannot be resized.');record.bytes=actualBytes;record.materializedBytes=materializedBytes;record.generation++;this.budget.resourceChanged();};
  release.pin=()=>{requireValue(!closed,'Backing ownership is closed.');record.pins++;borrowed++;let done=false;return()=>{if(done)return;done=true;record.pins--;borrowed--;if(!record.pins&&record.reclaimable)this.budget.notifyReclaimable();this.budget.resourceChanged();};};
  release.setReclaimable=value=>{if(closed)return;const changed=!record.reclaimable&&value;record.reclaimable=!!value;if(changed&&!record.pins)this.budget.notifyReclaimable();this.budget.resourceChanged();};
  Object.defineProperties(release,{id:{value:record.id},generation:{get:()=>record.generation},bytes:{get:()=>record.bytes}});
  this.budget.resourceChanged();return release;
 }
 beginPressure({kind,owner,operation,requestedBytes=0}={}){
  requireValue(kind===undefined||BACKING_KINDS.includes(kind),'Invalid recovery allocation domain.');
  requireValue(operation===undefined||this.has(operation),'Invalid recovery operation.');
  const record={sequence:++this.pressureSequence,kind:kind??null,owner:owner??operation?.owner??null,operation:operation?.key??null,requestedBytes:Number.isSafeInteger(requestedBytes)&&requestedBytes>0?requestedBytes:0};this.pressures.add(record);let closed=false;this.budget.resourceChanged();
  return()=>{if(closed)return;closed=true;this.pressures.delete(record);this.budget.resourceChanged();};
 }
 underPressure(kind){return [...this.pressures].some(record=>record.kind===kind);}
 // Recovery priorities are global, although only a matching domain defers new
 // growth. This total order also prevents AB -> GPU -> AB pressure cycles.
 // Descendants inherit the earliest pressure of their useful parent operation.
 pressurePriority(operation){
  let priority=Infinity;for(const pressure of this.pressures)if(pressure.operation&&this.isDescendant(operation?.key,pressure.operation))priority=Math.min(priority,pressure.sequence);return priority;
 }
 isDescendant(key,parent){
  const seen=new Set();while(key&&!seen.has(key)){if(key===parent)return true;seen.add(key);key=this.operations.get(key)?.parent;}return false;
 }
 blockingPressure(kind,operation){
  const priority=this.pressurePriority(operation);let first=null;
  for(const pressure of this.pressures){
   if(pressure.kind!==kind||!pressure.operation||!this.operations.has(pressure.operation)||this.isDescendant(operation?.key,pressure.operation))continue;
   const other=this.pressurePriority(this.operations.get(pressure.operation).ticket);
   if(priority<=other)continue;
   if(!first||other<this.pressurePriority(this.operations.get(first.operation).ticket))first=pressure;
  }
  return first;
 }
 dependencyKeys(record){
  return record.dependencies.flatMap(key=>typeof key==='number'?[key]:typeof key==='string'&&key.startsWith('owner:')?[...this.operations.values()].filter(value=>value.owner===key.slice(6)).map(value=>value.key):[]);
 }
 // One reachability calculation serves opportunity waits and admission checks.
 // A queued component is not a producer merely because its promises exist.
 productive({blockedTickets=new Set(),blockedOwners=new Set(),legacyBlocked=new Set()}={}){
  const ready=new Set(),eligible=[...this.operations.values()].filter(record=>!blockedOwners.has(record.owner)&&!blockedTickets.has(record.key));
  for(const producer of this.budget.resourceProducers)if(producer.active&&!legacyBlocked.has(producer.owner))ready.add('owner:'+producer.owner);
  for(const record of eligible)if(['ready','compute','io'].includes(record.state)){ready.add(record.key);ready.add('owner:'+record.owner);}
  let changed=true;while(changed){changed=false;for(const record of eligible)if(!ready.has(record.key)&&['queued','waiting-child'].includes(record.state)&&record.dependencies.some(key=>ready.has(key))){ready.add(record.key);ready.add('owner:'+record.owner);changed=true;}}
  return {ready,eligible};
 }
 closedWaitCycle(operation,graph=this.productive()){
  if(!this.has(operation))return null;const {ready}=graph,start=operation.key;
  if(ready.has(start))return null;
  const eligible=key=>{const value=this.operations.get(key);return value&&!ready.has(key)&&['queued','waiting-child'].includes(value.state);};
  if(!eligible(start))return null;
  const reachable=new Set(),visit=key=>{if(reachable.has(key)||!eligible(key))return;reachable.add(key);for(const next of this.dependencyKeys(this.operations.get(key)))visit(next);};visit(start);
  // Find a closed strongly connected component reachable from this waiter,
  // including a cycle downstream of it. An external live IO/recovery owner
  // keeps the component open even if it currently holds no CPU lease.
  let sequence=0,component=null;const indices=new Map(),low=new Map(),stack=[],stacked=new Set();
  const connect=key=>{
   indices.set(key,sequence);low.set(key,sequence++);stack.push(key);stacked.add(key);
   for(const next of this.dependencyKeys(this.operations.get(key))){if(!reachable.has(next))continue;if(!indices.has(next)){connect(next);low.set(key,Math.min(low.get(key),low.get(next)));}else if(stacked.has(next))low.set(key,Math.min(low.get(key),indices.get(next)));}
   if(low.get(key)!==indices.get(key))return;const members=[];let current;do{current=stack.pop();stacked.delete(current);members.push(current);}while(current!==key);
   const keys=new Set(members),cyclic=members.length>1||this.dependencyKeys(this.operations.get(key)).includes(key),closed=members.every(at=>this.dependencyKeys(this.operations.get(at)).every(next=>keys.has(next)||!this.operations.has(next)));
   if(cyclic&&closed&&!component)component=members;
  };
  connect(start);if(!component)return null;
  return component.map(key=>{const {owner,id,state,resource,dependencies}=this.operations.get(key);return {key,owner,id,state,resource,dependencies:dependencies.slice()};});
 }
 dependencyCycleError(operation,resource,graph){
  const operations=this.closedWaitCycle(operation,graph);return operations?new EngineError('RESOURCE_DEPENDENCY_CYCLE','Resource admission has a closed dependency cycle.',{details:{resumable:true,dependencyCycle:{resource,operations}}}):null;
 }
 beginOperation({owner,id,parent}={}){
  requireValue(typeof owner==='string'&&owner.length>0,'An operation owner is required.');
  requireValue(parent===undefined||this.has(parent),'Invalid parent operation.');
  const key=++this.sequence,record={key,owner,id:String(id??'operation'),state:'ready',resource:null,dependencies:[],parent:parent?.key??null,revision:0,commits:0,usefulRevision:0,children:new Set(),childPrevious:null};let closed=false;
  const ticket={key,owner,id:record.id,budget:this.budget,
   get closed(){return closed;},get committed(){return record.commits;},get usefulRevision(){return record.usefulRevision;},get state(){return closed?'completed':record.state;},
   setState:(state,{resource=null,dependencies=[]}={})=>{if(closed)return;requireValue(STATES.includes(state)&&Array.isArray(dependencies),'Invalid useful operation state.');const next=dependencies.map(value=>typeof value==='string'||Number.isSafeInteger(value)?value:value?.key).filter(value=>value!==undefined);if(record.state===state&&record.resource===resource&&record.dependencies.length===next.length&&record.dependencies.every((value,index)=>value===next[index]))return;record.state=state;record.resource=resource;record.dependencies=next;this.budget.resourceChanged();},
   commit:()=>{if(closed)return;record.revision++;record.commits++;for(let current=record;current;current=this.operations.get(current.parent))current.usefulRevision++;this.budget.resourceCommits.set(owner,(this.budget.resourceCommits.get(owner)??0)+1);this.budget.resourceChanged();},
   release:()=>{if(closed)return;closed=true;this.operations.delete(key);if(parent){const previous=this.operations.get(parent.key);if(previous){previous.children.delete(key);if(previous.state==='waiting-child'){if(previous.children.size)parent.setState('waiting-child',{dependencies:[...previous.children]});else parent.setState(previous.childPrevious??'ready');}}}this.budget.resourceChanged();}
  };record.ticket=ticket;this.operations.set(key,record);if(parent){const previous=this.operations.get(parent.key);if(!previous.children.size)previous.childPrevious=previous.state;previous.children.add(key);parent.setState('waiting-child',{dependencies:[...previous.children]});}this.budget.resourceChanged();return ticket;
 }
 has(ticket){return !!ticket&&this.operations.get(ticket.key)?.ticket===ticket;}
 progress(owner,kind,operation){
  const blockedOwners=new Set([...(operation?[]:[owner]),...this.budget.unscopedResourceWaiters.keys(),...[...this.pressures].filter(value=>!value.operation).map(value=>value.owner).filter(Boolean)]);
  const blockedTickets=new Set([operation?.key,...this.waitingOperations.keys()]);
  const legacyBlocked=new Set([owner,...this.budget.resourceWaiters.keys(),...[...this.pressures].map(value=>value.owner).filter(Boolean)]),{ready,eligible}=this.productive({blockedTickets,blockedOwners,legacyBlocked});
  const independent=eligible.filter(record=>ready.has(record.key)),represented=new Set(independent.map(record=>'owner:'+record.owner)),legacy=[...ready].filter(key=>typeof key==='string'&&!represented.has(key));
  return {releasedBytes:this.budget.backingReleased.get(kind)??0,reusableBytes:this.budget.backingReusable.get(kind)??0,commits:[...this.budget.resourceCommits].reduce((sum,[key,value])=>sum+(!operation&&key===owner?0:value),0)-(operation?.committed??0),independentProducers:independent.length+legacy.length,operations:independent.map(record=>({id:record.id,owner:record.owner,state:record.state,resource:record.resource})),blockedOperations:eligible.filter(record=>!ready.has(record.key)).map(record=>({id:record.id,owner:record.owner,state:record.state,resource:record.resource}))};
 }
 snapshot({allocations=false}={}){
  const domains=Object.fromEntries(BACKING_KINDS.map(kind=>[kind,{reservedBytes:0,materializedBytes:0,pinnedBytes:0,reclaimableBytes:0,backings:0,owners:{}}]));
  for(const backing of this.backings){const domain=domains[backing.kind];domain.reservedBytes+=backing.bytes;domain.materializedBytes+=backing.materializedBytes;domain.pinnedBytes+=backing.pins?backing.materializedBytes:0;domain.reclaimableBytes+=backing.reclaimable&&!backing.pins?backing.materializedBytes:0;domain.backings++;const owner=domain.owners[backing.owner]??={reservedBytes:0,materializedBytes:0,pinnedBytes:0,reclaimableBytes:0};owner.reservedBytes+=backing.bytes;owner.materializedBytes+=backing.materializedBytes;owner.pinnedBytes+=backing.pins?backing.materializedBytes:0;owner.reclaimableBytes+=backing.reclaimable&&!backing.pins?backing.materializedBytes:0;}
  return {domains,...(allocations?{allocations:[...this.backings].map(record=>({...record}))}:{}),pressures:[...this.pressures].map(value=>({...value})),operations:[...this.operations.values()].map(({ticket,...record})=>({...record,children:[...record.children],dependencies:record.dependencies.slice()})),waitingOwners:[...this.budget.resourceWaiters.keys()],backingReleased:Object.fromEntries(this.budget.backingReleased),backingReusable:Object.fromEntries(this.budget.backingReusable),meaning:'Registered backing ownership; policy reservations are separate and retirement does not force browser garbage collection.'};
 }
}

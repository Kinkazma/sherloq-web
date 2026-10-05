import "../../runtime-context.js?v=0.14.5";
import {EngineError,checkAbort} from './errors.js';
const gates=new WeakMap();
// Look-ahead is learned only from actual pyramid service. It is not a probe:
// slow useful CPU preparation may need several lanes to feed one GPU queue.
export class SiftPreparationGate{
 constructor(maximum){this.maximum=maximum;this.capacity=1;this.active=new Set();this.queue=[];this.preparation=0;this.service=0;}
 sample(kind,milliseconds){if(!(milliseconds>0))return;this[kind]=this[kind]?(this[kind]+milliseconds)/2:milliseconds;if(this.preparation&&this.service)this.capacity=Math.min(this.maximum,Math.max(1,Math.ceil(this.preparation/this.service)+1));this.pump();}
 acquire({signal,operation}={}){checkAbort(signal);return new Promise((resolve,reject)=>{const item={signal,operation,resolve,reject};item.abort=()=>{const at=this.queue.indexOf(item);if(at<0)return;this.queue.splice(at,1);signal.removeEventListener('abort',item.abort);reject(new EngineError('CANCELLED','SIFT preparation cancelled.'));this.pump();};signal?.addEventListener('abort',item.abort,{once:true});this.queue.push(item);this.pump();});}
 pump(){for(const item of this.queue)item.operation?.setState('queued',{resource:'gpu-preparation',dependencies:[...this.active].map(value=>value.operation).filter(Boolean)});while(this.queue.length&&this.active.size<this.capacity){const item=this.queue.shift();item.signal?.removeEventListener('abort',item.abort);this.active.add(item);item.operation?.setState('ready');let closed=false;item.resolve(()=>{if(closed)return;closed=true;this.active.delete(item);this.pump();});}}
}
export function getSiftPreparationGate(budget,maximum){let gate=gates.get(budget);if(!gate){gate=new SiftPreparationGate(maximum);gates.set(budget,gate);}return gate;}

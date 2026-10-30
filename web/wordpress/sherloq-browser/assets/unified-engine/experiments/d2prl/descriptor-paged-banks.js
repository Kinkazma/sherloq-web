import {createPagedD2prlTensor,isPagedD2prlTensor} from './paged-feature-tensor.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
const identities=new WeakSet(),WINDOW=16*1024**2;
export const isPagedD2prlDescriptorBanks=value=>identities.has(value);
const ack=async work=>{const value=await work();if(value===0||value===false)throw value;return value;};
/** Complete native half banks. Construction returns an owner before any store
 * or reservation is admitted. Existing descriptor graph supplies each scale;
 * this module performs only byte-exact bounded copies and ownership handoff. */
export function createPagedD2prlDescriptorBanks(side,{budget,temporarySession,getTemporarySession,storage='temporary',tensorFactory=createPagedD2prlTensor}={}){
 requireValue(Number.isSafeInteger(side)&&side>=2&&side<=1792&&budget?.reserve,'Complete native descriptor side and shared budget required');
 const n=side*side,life=new AbortController(),pending=new Set(),loans=new Set(),fields=new Map(),copied=new Set();let copying=false,metadata,initializing,publishing,published=false,closed=false,retired=false,closing;
 const combined=extra=>AbortSignal.any([life.signal,...(extra?[extra]:[])]);
 const alive=extra=>{checkAbort(extra);checkAbort(life.signal);if(closed)throw new EngineError('DISPOSED','Native paged descriptor banks closed');};
 const track=work=>{const p=Promise.resolve().then(work);pending.add(p);p.then(()=>pending.delete(p),()=>pending.delete(p));return p;};
 const drainLoans=async()=>{let failed=false,primary;for(const loan of [...loans])try{await ack(()=>loan.release());loans.delete(loan);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;};
 const initialize=extra=>{
  alive(extra);if(initializing)return initializing;
  initializing=(async()=>{metadata??=budget.reserve(4096);for(const [name,channels]of [['zm',36],['cnn',96]]){if(!fields.has(name))fields.set(name,tensorFactory([1,channels,side,side],{dtype:'float16',budget,temporarySession,getTemporarySession,storage,label:'native-descriptor-bank:'+name}));await fields.get(name).initialize({signal:combined(extra)});alive(extra);}return actor;})();
  void initializing.catch(()=>{initializing=null;});return initializing;
 };
 const actor={schema:'sherloq.d2prl-paged-descriptor-banks/1',side,
  initialize:({signal}={})=>track(()=>initialize(signal)),
  copyScale(name,scale,input,{signal}={}){alive(signal);requireValue(!copying&&!published&&!publishing&&['zm','cnn'].includes(name)&&Number.isInteger(scale)&&scale>=0&&scale<3,'Mutable original descriptor scale required');copying=true;const work=track(async()=>{try{
   await drainLoans();alive(signal);const channels=name==='zm'?12:32,count=channels*n,code=name+':'+scale;
   requireValue(!copied.has(code)&&(isPagedD2prlTensor(input)?input.dtype==='float16'&&JSON.stringify(input.shape)===JSON.stringify([1,channels,side,side])&&input.snapshot().sealed&&!input.snapshot().closed:input instanceof Uint16Array&&input.length===count),'Complete original half scale required');
   await initialize(signal);alive(signal);const output=fields.get(name),elements=WINDOW/2;
   for(let offset=0;offset<count;offset+=elements){alive(signal);const length=Math.min(elements,count-offset);let loan,copyFailed=false,copyPrimary;
    try{if(isPagedD2prlTensor(input)){loan=await input.readFlat(offset,length,{signal:combined(signal)});loans.add(loan);alive(signal);}else loan={data:input.subarray(offset,offset+length),release(){}};await output.writeFlat(scale*count+offset,loan.data,{signal:combined(signal)});alive(signal);}
    catch(error){copyFailed=true;copyPrimary=error;throw error;}finally{if(loan&&loans.has(loan))try{await ack(()=>loan.release());loans.delete(loan);}catch(error){if(!copyFailed)throw error;if(copyPrimary&&typeof copyPrimary==='object'&&Object.isExtensible(copyPrimary))try{copyPrimary.details={...copyPrimary.details,descriptorCopyCleanup:error};}catch{}}}
   }
   copied.add(code);
   }finally{copying=false;}});return work;},
  publish({signal}={}){
   alive(signal);if(published)return Promise.resolve(actor);if(publishing)return publishing;const writes=[...pending];
   publishing=(async()=>{await Promise.all(writes);await drainLoans();alive(signal);requireValue(copied.size===6,'Every original ZM/CNN scale must be complete before publication');await initialize(signal);for(const field of fields.values()){await field.seal({signal:combined(signal)});alive(signal);}published=true;return actor;})();void publishing.catch(()=>{publishing=null;});return publishing;
  },
  transferField(name,accept){alive();requireValue(published&&['zm','cnn'].includes(name)&&typeof accept==='function'&&fields.has(name),'Published owned descriptor field required');const tensor=fields.get(name),result=accept(tensor);requireValue(result!==0&&result!==false&&!(result instanceof Promise),'Descriptor transfer requires synchronous bank adoption');fields.delete(name);return result;},
  get zm(){alive();requireValue(published,'Descriptor bank is not published');return fields.get('zm');},
  get cnn(){alive();requireValue(published,'Descriptor bank is not published');return fields.get('cnn');},
  snapshot(){return{side,published,closed,retired,copying,pending:pending.size,loans:loans.size,scales:[...copied],fields:Object.fromEntries([...fields].map(([name,value])=>[name,value.snapshot()]))};},
  release(){return actor.dispose();},
  dispose(){
   if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();const waits=[...pending,...(initializing?[initializing]:[]),...(publishing?[publishing]:[])];
   closing=(async()=>{await Promise.allSettled(waits);let failed=false,primary;try{await drainLoans();}catch(error){failed=true;primary=error;}for(const [name,field]of [...fields])try{await ack(()=>field.dispose());fields.delete(name);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;if(metadata){await ack(metadata);metadata=null;}retired=true;identities.delete(actor);})();void closing.catch(()=>{closing=null;});return closing;
  }
 };Object.freeze(actor);identities.add(actor);return actor;
}

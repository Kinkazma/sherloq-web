import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue} from './errors.js';
import {classicSiftRetirement} from './classic-sift-retirement.js';
export function createClassicSiftInputWindow({budget,owner,label='classic-sift-input'}={}){
 let buffer,capacity=0,inFlight=false,borrowed=false,release,backing,closed=false,retiring;
 const api={get byteLength(){return capacity;},get inFlight(){return inFlight;},
  async ensure(bytes,reserve){requireValue(!closed&&!inFlight&&!borrowed,'SIFT input window is not idle.');if(capacity>=bytes)return;await api.retire();release=reserve(bytes);capacity=bytes;buffer=new ArrayBuffer(bytes);backing=budget.registerBacking?.('array-buffer',bytes,{owner,label});},
  checkout(Type,length){requireValue(!closed&&!inFlight&&!borrowed&&length*Type.BYTES_PER_ELEMENT<=capacity&&buffer?.byteLength===capacity,'Invalid SIFT input checkout.');borrowed=true;return new Type(buffer,0,length);},
  sent(){requireValue(borrowed&&!inFlight,'Invalid SIFT input dispatch');inFlight=true;},
  takeBack(returned){requireValue(inFlight&&returned instanceof ArrayBuffer&&returned.byteLength===capacity,'Invalid SIFT input ACK.');buffer=returned;inFlight=false;},
  async retireAfterChildAck(){inFlight=false;borrowed=false;await api.retire();},
  park(){requireValue(!inFlight,'Cannot park SIFT input before ACK.');borrowed=false;},
  retire(){if(retiring)return retiring();requireValue(!inFlight,'Cannot retire SIFT input before ACK.');let notified=false;retiring=classicSiftRetirement([async()=>{await backing?.();backing=null;},()=>{if(!notified&&capacity){budget.notifyBackingRelease?.('array-buffer',capacity);notified=true;}},async()=>{await release?.();release=null;}],()=>{buffer=null;capacity=0;borrowed=false;retiring=null;});return retiring();},
  async dispose(){closed=true;await api.retire();}
 };return api;
}

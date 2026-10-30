import {requireValue} from './errors.js';
import {neuralWindowAck} from './neural-window-job-owner.js';
/** Worker-side mirror of one Window runtime capacity. The existing parent
 * retirement registry adopts this owner before its first reservation. The
 * Window service remains separately funded after this engine mirror retires. */
export function createNeuralWindowRuntimeEscrow({budget,onOwner}={}){
 requireValue(budget?.reserve&&typeof onOwner==='function','Runtime escrow needs its actual Native budget and parent owner.');
 const loans=[],connections=new Set();let peak=0,closed=false,flight;
 const owner={get snapshot(){return{persistentMirrorBytes:peak,connections:connections.size,closed};},
  admit(bytes){requireValue(!closed&&Number.isSafeInteger(bytes)&&bytes>0,'Runtime capacity mirror is closed or invalid.');if(bytes<=peak)return peak;const record={free:null,bytes:bytes-peak};loans.push(record);try{record.free=budget.reserve(record.bytes);peak=bytes;}catch(error){if(!record.free)loans.splice(loans.indexOf(record),1);throw error;}return peak;},
  attach(connection){requireValue(!closed&&connection&&typeof connection.close==='function','Runtime connection must be adopted before transport.');connections.add(connection);return()=>connections.delete(connection);},
  dispose(){closed=true;if(flight)return flight;flight=(async()=>{let failed=false,primary;for(const connection of [...connections])try{await neuralWindowAck(()=>connection.close());connections.delete(connection);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;for(const loan of [...loans])try{await neuralWindowAck(()=>loan.free());loans.splice(loans.indexOf(loan),1);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;peak=0;})();void flight.catch(()=>{flight=null;});return flight;}
 };onOwner(owner);return owner;
}

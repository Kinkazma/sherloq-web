import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue} from './errors.js';

// Reuse one admitted allowance across sequential buffer lifetimes. Closing the
// scope cannot release its accounting while a reader still owns a buffer.
export function createReservationScope(reservation){
 requireValue(typeof reservation==='function'&&Number.isSafeInteger(reservation.bytes)&&reservation.bytes>=0,'An owned memory reservation is required.');
 const capacity=reservation.bytes;let used=0,closed=false,borrowers=0;
 return {
  reserve(bytes){
   requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Invalid scoped allocation.');
   if(closed)throw new EngineError('DISPOSED','Operation memory scope is closed.');
   if(bytes>capacity-used)throw new EngineError('MEMORY_LIMIT','Operation buffers exceed their admitted allowance.',{details:{admissionScope:'fixed',requestedBytes:bytes,availableBytes:capacity-used,shortfallBytes:bytes-(capacity-used),budgetBytes:capacity}});
   used+=bytes;borrowers++;let released=false;
   return ()=>{if(released)return;released=true;used-=bytes;borrowers--;if(closed&&!borrowers)reservation();};
  },
  close(){if(closed)return;closed=true;if(!borrowers)reservation();}
 };
}

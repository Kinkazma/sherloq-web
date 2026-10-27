// A menu action may outlive the visible lens; it must keep the same source identity.
export function createRecentSelection({ttl=15_000,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onExpired=()=>{}}={}){
 let record=null,timer=null;
 function clear(){if(timer!==null)cancel(timer);timer=null;record=null;}
 function get(){if(record&&now()>=record.until){clear();onExpired();}return record?.value??null;}
 return {set(value){clear();record={value,until:now()+ttl};timer=schedule(()=>{timer=null;get();},ttl);},get,clear};
}

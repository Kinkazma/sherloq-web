// UI-only owner: it never owns scientific sources, surfaces or native loans.
export function createRetainedDisplayReadOwner({capture,isCurrent}){
 let owned=null;
 const discard=()=>{const old=owned;owned=null;old?.ticket.discard();};
 return{
  begin(){const context=capture();if(typeof context?.surface?.suspendDisplayReads!=='function')return;const ticket=context.surface.suspendDisplayReads(),old=owned;owned={context,ticket};old?.ticket.discard();},
  settle(){const old=owned;owned=null;if(!old)return;let resume=false;try{resume=isCurrent(old.context);}finally{if(resume)old.ticket.resume();else old.ticket.discard();}},
  discard,
  get active(){return owned!==null;}
 };
}

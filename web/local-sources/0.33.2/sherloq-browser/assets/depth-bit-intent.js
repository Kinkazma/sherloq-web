// A constraint may adapt the displayed bit without changing the user's intent.
// Only an actual setting edit replaces that intent for both working depths.
export function createDepthBitIntent(){
 let source=null,requested=null,applied=null;
 return {
  clear(){source=null;requested=applied=null;},
  edit(owner,value){
   if(!Number.isInteger(value)||value<0||value>15)return;
   source=owner;requested=applied=value;
  },
  adapt(owner,value,depth){
   if(!Number.isInteger(value)||value<0||value>15)return null;
   if(source!==owner||requested===null){source=owner;requested=value;}
   else if(applied!==null&&value!==applied)requested=value;
   const bit=Math.min(requested,depth===16?15:7);
   applied=bit;
   return{bit,requested};
  },
  requested(owner){return source===owner?requested:null;}
 };
}

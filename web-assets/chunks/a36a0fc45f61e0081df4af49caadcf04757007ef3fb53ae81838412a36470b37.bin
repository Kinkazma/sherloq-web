// MT19937 compatibility with the declared native CPU generator, not Math.random.
// Adapted algorithm: Matsumoto/Nishimura1997–2002; see MT19937-LICENSE.txt.
import{requireValue,checkAbort,controlCheckpoint}from'../../src/errors.js';
export class NativeRandom{
 constructor({state,left,next}){
  requireValue((Array.isArray(state)||state instanceof Uint32Array)&&state.length===624&&Array.from(state).every(v=>Number.isInteger(v)&&v>=0&&v<=0xffffffff)&&Number.isInteger(left)&&left>0&&left<=624&&Number.isInteger(next)&&next>=0&&next<=624,'Invalid native uniform RNG state');
  requireValue((left===1&&next===0)||left+next===625,'Inconsistent native RNG cursor');this.state=Uint32Array.from(state);this.left=left;this.next=next;this.busy=false;
 }
 word(){
  requireValue(!this.busy&&this.state!==null,'Random generator unavailable');return this.nextWord();
 }
 nextWord(){
  const s=this.state;
  if(--this.left===0){for(let i=0;i<624;i++){const a=s[i],b=s[(i+1)%624],mixed=(a&0x80000000)|(b&0x7fffffff);s[i]=s[(i+397)%624]^(mixed>>>1)^((b&1)?0x9908b0df:0);}this.left=624;this.next=0;}
  let v=s[this.next++];v^=v>>>11;v^=(v<<7)&0x9d2c5680;v^=(v<<15)&0xefc60000;v^=v>>>18;return v>>>0;
 }
 uniform(){return(this.word()&0xffffff)*2**-24;}
 async values(count,{signal,account=()=>{}}={}){
  requireValue(!this.busy&&this.state!==null,'Random generator unavailable');requireValue(Number.isSafeInteger(count)&&count>=0&&count<=2**28,'Invalid random tensor length');checkAbort(signal);account(count*4+2496);const output=new Float32Array(count),state=this.state.slice(),left=this.left,next=this.next;let stamp=performance.now();this.busy=true;
  try{for(let i=0;i<count;i++){output[i]=(this.nextWord()&0xffffff)*2**-24;if((i&8191)===0){checkAbort(signal);if(performance.now()-stamp>=8){await controlCheckpoint(signal);stamp=performance.now();}}}checkAbort(signal);return output;}catch(error){this.state=state;this.left=left;this.next=next;throw error;}finally{this.busy=false;}
 }
 snapshot(){requireValue(this.state!==null,'Random generator disposed');return{state:Array.from(this.state),left:this.left,next:this.next};}
 dispose(){requireValue(!this.busy,'Random generator busy');this.state=null;}
}

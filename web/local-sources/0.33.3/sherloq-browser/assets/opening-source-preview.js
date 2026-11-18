// Opening presentation belongs to the current Original decode. It is never an
// analysis input and must not start another codec or re-encode the source Blob.
const cancelled=()=>Object.assign(Error('The opening source changed.'),{code:'CANCELLED'});
export function createOpeningSourcePreview({file,isCurrent=()=>true}={}){
 let resolve,reject,state='pending',requested=false;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});void promise.catch(()=>{});
 return {
  get requested(){return requested;},
  publish(preview){if(state!=='pending'||!isCurrent())return false;state='ready';resolve(preview);return true;},
  fail(error=cancelled()){if(state!=='pending')return;state='closed';reject(error);},
  async decodePreview(input,{signal}={}){
   if(input!==file||!isCurrent()||signal?.aborted)throw cancelled();requested=true;
   let abort;const aborted=new Promise((_,no)=>{abort=()=>no(cancelled());signal?.addEventListener('abort',abort,{once:true});});
   try{const value=await Promise.race([promise,aborted]);if(!isCurrent()||signal?.aborted)throw cancelled();return value;}
   finally{signal?.removeEventListener('abort',abort);}
  }
 };
}
export function createSourceOpeningPreviewRelay({publish=()=>false,isCurrent=()=>true}={}){
 let owner=null;
 const current=value=>value===owner&&isCurrent(value);
 return {
  begin(value){owner={...value,published:false,fallback:null};return owner;},
  clear(value=owner){if(owner===value)owner=null;},
  progress(event){
   if(event?.phase!=='source-preview')return false;
   const value=owner;
   if(value&&current(value)&&event.id===value.imageId&&event.preview&&!value.published)value.published=publish(event.preview,value)===true;
   // Pixel packets never become textual progress, including stale replies.
   return true;
  },
  fallback(value,{display,readDisplay,maximumWidth=4096,maximumHeight=4096,maximumPixels=4*1024**2}={}){
   if(!current(value)||value.published)return Promise.resolve(false);
   if(value.fallback)return value.fallback;
   value.fallback=(async()=>{
    const {width,height}=display??{};
    if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||typeof readDisplay!=='function')return false;
    const step=Math.max(1,Math.ceil(Math.max(width/maximumWidth,height/maximumHeight,Math.sqrt(width*height/maximumPixels))));
    const answer=await readDisplay({display,tile:{x:0,y:0,w:width,h:height,step}});
    if(!current(value)||value.published)return false;
    const pixels=answer?.pixels;
    if(!pixels||pixels.format!=='rgb8'||pixels.width!==Math.ceil(width/step)||pixels.height!==Math.ceil(height/step)||!(pixels.data instanceof Uint8Array)||pixels.data.length!==pixels.width*pixels.height*3)throw Object.assign(Error('Invalid shared Original opening preview.'),{code:'INVALID_INPUT'});
    value.published=publish({pixels,sourceWidth:width,sourceHeight:height,decoder:'shared-original-display'},value)===true;return value.published;
   })();return value.fallback;
  }
 };
}

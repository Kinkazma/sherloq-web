/** Complete B-Free browser preprocessing and five-window logit reduction. No Python. */
import {readRGBWindow} from './source-window.js';
const VERSION = 'bfree-official-grid14-five504-v1';
const MEAN = new Float32Array([0.485, 0.456, 0.406]);
const STD = new Float32Array([0.229, 0.224, 0.225]);
function check(signal) { if (signal?.aborted) { const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; } }
function pixels(image) {
  const {width, height, data} = image;
  const channels = data?.length / (width * height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || ![3,4].includes(channels) || data.BYTES_PER_ELEMENT !== 1) throw new TypeError('Expected RGB/RGBA uint8 image pixels');
  if (width < 14 || height < 14) throw new RangeError('B-Free needs at least one complete 14-pixel patch on each axis');
  return {width,height,data,channels};
}
async function digestPixels(p, supplied) {
  if (supplied) return supplied;
  const bytes = new Uint8Array(p.data.buffer,p.data.byteOffset,p.data.byteLength);
  const hash = await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function prepare(image, {memo, signal, onProgress, digest} = {}) {
  check(signal); const p = image.data?pixels(image):image;
  if(!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||p.width<14||p.height<14)throw Error('Invalid B-Free geometry');
  const identity=digest??p.sourceSha256;if(!identity&&!p.data)throw Error('Window source identity required');
  const key = `${VERSION}:${p.width}x${p.height}:${await digestPixels(p,identity)}`;
  if (memo?.has(key)) return memo.get(key);
  const gh = Math.floor(p.height/14), gw = Math.floor(p.width/14);
  // Upstream repeat_wrap trims BOTH axes to 36 if either is shorter than 36.
  const short = gh<36 || gw<36, eh=short?36:gh, ew=short?36:gw;
  const cy=Math.max(Math.floor((eh-36)/2),0), cx=Math.max(Math.floor((ew-36)/2),0);
  const origins=[[cy,cx],[0,0],[eh-36,0],[eh-36,ew-36],[0,ew-36]];
  const patches=[]; const area=504*504;
  for (let n=0;n<origins.length;n++) {
    check(signal); const out=new Float32Array(3*area), [oy,ox]=origins[n];
    let window,source=p;
    if(!p.data){
      window=await readRGBWindow(p,short?{x:0,y:0,width:Math.min(p.width,504),height:Math.min(p.height,504)}:{x:ox*14,y:oy*14,width:504,height:504},{signal});
      source={...window.pixels,channels:3};
    }
    try{
    for(let y=0;y<504;y++) {
      const sy=window&&!short?y:(oy*14+y)%(gh*14);
      for(let x=0;x<504;x++) {
        const sx=window&&!short?x:(ox*14+x)%(gw*14), src=(sy*source.width+sx)*source.channels, dst=y*504+x;
        for(let c=0;c<3;c++) {
          const v=Math.fround(source.data[src+c]/255);
          out[c*area+dst]=Math.fround(Math.fround(v-MEAN[c])/STD[c]);
        }
      }
    }
    }finally{window?.release();}
    patches.push({feeds:{images:{data:out,dims:[1,3,504,504],type:'float32'}},origin_embedding_grid:origins[n]});
    onProgress?.({phase:'preprocess',completed:n+1,total:5});
  }
  const prepared={method:'bfree',version:VERSION,key,patches,width:p.width,height:p.height,preprocessing:'Official 14-pixel embedding grid, five 504² windows, no resizing'};
  memo?.set(key,prepared);return prepared;
}
export function aggregate(logits) {
  if(logits.length!==5 || !logits.every(Number.isFinite)) throw new TypeError('Expected five finite B-Free logits');
  const global_logit=logits.reduce((a,b)=>a+b,0)/5;
  return {global_logit,sigmoid_score_uncalibrated:1/(1+Math.exp(-global_logit)),global_decision_at_default_threshold:global_logit>0?'ai_generated':'real',default_logit_threshold:0};
}
export async function runPrepared(prepared,{loadSession,infer},{memo,signal,onProgress}={}) {
  check(signal);const cacheKey=`bfree-embeddings:${prepared.key}`;
  let logits=memo?.get(cacheKey);
  if(!logits) {
    const session=await loadSession('bfree-encoder-v1','models/bfree/encoder.onnx');logits=[];
    for(let i=0;i<prepared.patches.length;i++) {
      check(signal);const outputs=await infer(session,prepared.patches[i].feeds);
      const tensor=outputs.logits??Object.values(outputs)[0];logits.push(Number(tensor.data[0]));
      onProgress?.({phase:'inference',completed:i+1,total:5});
    }
    memo?.set(cacheKey,logits);
  }
  return {method:'bfree',status:'ok',scores:aggregate(logits),window_logits:logits,scientific_limits:['Whole-image generation score; does not localize retouching.','A low score does not exclude partially AI-generated edits.','Sigmoid score is not calibrated authenticity confidence.']};
}
export {VERSION as preprocessingVersion};

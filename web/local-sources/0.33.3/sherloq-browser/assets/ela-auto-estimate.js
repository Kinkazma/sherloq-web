import {EngineError,checkAbort,controlCheckpoint} from './unified-engine/src/errors.js';
import {validateParams} from './unified-engine/src/ela.js';
import {compileForgeryscopeScientificScope} from './unified-engine/src/forgeryscope-scientific-scope.js';

// Independent implementation of the published a-contrario quantization-error
// equations, not a port of IPOL's source code. Statistical reference:
// Nikoukhah, Colom, Morel & Grompone von Gioi, IPOL12(2022),173–197,
// https://doi.org/10.5201/ipol.2022.399 . This bounded, stratified phase search is
// a separate policy; it does not claim IPOL's complete-image qualification.
// IJG tables and scaling convention:
// https://github.com/libjpeg-turbo/libjpeg-turbo/blob/main/src/jcparam.c
const LUMA=[16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
const CHROMA=[17,18,24,47,99,99,99,99,18,21,26,66,99,99,99,99,24,26,56,99,99,99,99,99,47,66,99,99,99,99,99,99,...Array(32).fill(99)];
const SCOUT=[1,8,9,2,16,10,17,3,24],WORKSPACE=4*1024**2,MAX_PATCHES=16,PATCH_SIDE=64,MIN_SAMPLES=32,SEARCH_TESTS=2*64*63*255;
const fail=message=>{throw new EngineError('INVALID_INPUT',message);};
const round=x=>Math.trunc(x+(x<0?-.5:.5));
const expectedStep=(index,q,chroma=false,transpose=false)=>{const scale=q<50?Math.floor(5000/q):200-2*q,i=transpose?(index%8)*8+Math.floor(index/8):index;return Math.max(1,Math.min(255,Math.floor(((chroma?CHROMA:LUMA)[i]*scale+50)/100)));};

export function matchJpegQuantizationTables(header){
 const {quantization:tables,components}=header??{};
 if(!tables||!Array.isArray(components)||![1,3].includes(components.length)||components.some(id=>!Number.isSafeInteger(id)||!Array.isArray(tables[id])||tables[id].length!==64||tables[id].some(v=>!Number.isSafeInteger(v)||v<1||v>65535)))fail('Complete original JPEG quantization tables and component selectors are required.');
 const distances=[],candidates=[];let nearest=1,best=Infinity;
 for(let q=1;q<=100;q++){let sum=0;for(let c=0;c<components.length;c++)for(let i=0;i<64;i++)sum+=Math.abs(tables[components[c]][i]-expectedStep(i,q,c!==0));const distance=sum/(64*components.length);distances.push(distance);if(distance===0)candidates.push(q);if(distance<best){best=distance;nearest=q;}}
 return{kind:'current-file-tables',status:candidates.length===1?'exact-IJG-table':candidates.length?'ambiguous-IJG-table':'nonstandard-table',quality:candidates.length===1?candidates[0]:null,candidateQualities:candidates,referenceQuality:nearest,referenceMeaning:candidates.length===1?'Exact current IJG quantization tables.':'Nearest IJG recompression reference; not a recovered source quality.',deviation:best,distances,quantization:structuredClone(tables),components:[...components],sampling:structuredClone(header.sampling??null),chroma:header.chroma??null,history:'The current tables do not identify previous saves or establish authenticity.'};
}

/** An upper bound for P(sum of n independent U[0,1] <= sum).
 * The simplex-volume bound uses Stirling's lower bound for n!; Hoeffding's
 * bound applies to the lower tail. NFA multiplies by every searched test.
 * Neither a p-value nor NFA is a posterior probability of JPEG or forgery. */
export function quantizationLogNfa(samples,sum,{tests=64*63*255}={}){
 if(!Number.isSafeInteger(samples)||samples<0||!Number.isFinite(sum)||sum<0||sum>samples||!Number.isFinite(tests)||tests<1)fail('Invalid quantization statistical support.');
 if(samples===0)return Infinity;
 if(sum>=samples/2)return Math.log10(tests);
 if(sum===0)return -Infinity;
 const gap=samples/2-sum,logFactorialLower=(samples+.5)*Math.log(samples)-samples+.5*Math.log(2*Math.PI),simplex=(samples*Math.log(sum)-logFactorialLower)/Math.LN10,hoeffding=-2*gap*gap/samples/Math.LN10;
 return Math.log10(tests)+Math.min(0,simplex,hoeffding);
}

async function coefficientEvidence(values,count,cooperate){
 let best={step:null,logNfa:Infinity,samples:0};
 for(let step=1;step<=255;step++){if((step&31)===0)await cooperate();let sum=0,samples=0;for(let i=0;i<count;i++){const ratio=values[i]/step;if(round(ratio)!==0){sum+=Math.min(1,2*Math.abs(ratio-round(ratio)));samples++;}}
  if(samples<MIN_SAMPLES)continue;const score=quantizationLogNfa(samples,sum,{tests:SEARCH_TESTS});if(score<best.logNfa)best={step:score<0?step:null,logNfa:score,samples};
 }
 return best;
}
const area=p=>Math.abs(p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-b[0]*a[1];},0))/2;
function clipped(p,rect){for(const [axis,bound,sign]of [[0,rect[0],1],[0,rect[2],-1],[1,rect[1],1],[1,rect[3],-1]]){const next=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],inside=sign*(a[axis]-bound)>=0,other=sign*(b[axis]-bound)>=0;if(inside)next.push(a);if(inside!==other){const t=(bound-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}p=next;if(!p.length)break;}return p;}
function admitsBlock(compiled,x,y){if(!compiled)return true;const rect=[x,y,x+8,y+8];return compiled.regions.some(r=>area(clipped(r.polygon,rect))>=64-1e-8)&&!compiled.excluded.some(r=>r.bounds[0]<=rect[2]&&r.bounds[2]>=rect[0]&&r.bounds[1]<=rect[3]&&r.bounds[3]>=rect[1]&&clipped(r.polygon,rect).length);}
function patchPlan(width,height){
 const count=Math.min(MAX_PATCHES,Math.max(1,Math.ceil(width/PATCH_SIDE)*Math.ceil(height/PATCH_SIDE))),columns=Math.max(1,Math.min(count,Math.round(Math.sqrt(count*width/height)))),rows=Math.ceil(count/columns),seen=new Set(),out=[];
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){if(out.length===count)break;const px=Math.max(0,Math.min(width-8,Math.floor(((x+.5)*width/columns-(PATCH_SIDE+7)/2)/8)*8)),py=Math.max(0,Math.min(height-8,Math.floor(((y+.5)*height/rows-(PATCH_SIDE+7)/2)/8)*8)),key=px+','+py;if(seen.has(key))continue;seen.add(key);out.push({x:px,y:py,width:Math.min(PATCH_SIDE+7,width-px),height:Math.min(PATCH_SIDE+7,height-py)});}
 return out;
}
function weights(){const out=new Float64Array(64*64);for(let k=1;k<64;k++){const u=k%8,v=Math.floor(k/8),normal=.25*(u===0?Math.SQRT1_2:1)*(v===0?Math.SQRT1_2:1);for(let y=0;y<8;y++)for(let x=0;x<8;x++)out[k*64+y*8+x]=normal*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*v*Math.PI/16);}return out;}
function nativeCoefficients(patches,phase,frequencies,limit,compiled,basis){
 const values=frequencies.map(()=>new Float64Array(limit)),coordinates=[],pixels=new Float64Array(64),seen=new Set();let count=0,excluded=0;
 for(const p of patches){for(let y=(phase.y-p.rect.y%8+8)%8;y+8<=p.rect.height;y+=8)for(let x=(phase.x-p.rect.x%8+8)%8;x+8<=p.rect.width;x+=8){const gx=p.rect.x+x,gy=p.rect.y+y,key=gx+','+gy;if(seen.has(key))continue;seen.add(key);if(!admitsBlock(compiled,gx,gy)){excluded++;continue;}if(count===limit)return{values,count,coordinates,excluded};
   for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){const i=((y+yy)*p.rect.width+x+xx)*3;pixels[yy*8+xx]=.299*p.data[i]+.587*p.data[i+1]+.114*p.data[i+2];}
   for(let f=0;f<frequencies.length;f++){let sum=0;const at=frequencies[f]*64;for(let i=0;i<64;i++)sum+=pixels[i]*basis[at+i];values[f][count]=sum;}coordinates.push([gx,gy]);count++;
  }}return{values,count,coordinates,excluded};
}
function standardCandidates(records){const admitted=records.filter(r=>r.step!==null),out=[];if(!admitted.length)return out;for(const transpose of [false,true])for(let q=1;q<=100;q++)if(admitted.every(r=>r.step===expectedStep(r.frequency,q,false,transpose)))out.push({quality:q,tableTransform:transpose?'transpose':'identity'});return out;}
function phaseStrength(records){let meaningful=0,strength=0;for(const r of records)if(r.step!==null){meaningful++;strength+=Math.min(1000,-r.logNfa);}return{meaningful,strength};}

/** Estimate only: no source pixels are painted and no ELA result is published.
 * readRect(rect,{signal}) must return exact RGB8 native pixels, or {pixels,
 * release}. reserveMemory(bytes) must return a lease-release function. */
export async function estimateElaClassicAuto(input,{signal,onProgress,reserveMemory}={}){
 const {width,height,sourceSha256,readRect,scope}=input??{};if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||typeof sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(sourceSha256))fail('Native source dimensions and SHA256 are required.');checkAbort(signal);
 let header=input.header;if(!header&&input.blob&&input.inspectHeaders)header=(await input.inspectHeaders({blob:input.blob},{signal})).header;checkAbort(signal);
 const base={schema:'sherloq.ela-auto-estimate/1',sourceSha256,width,height,quality:null,probability:false,forgeryVerdict:null};
 if(header?.quantization){const evidence=matchJpegQuantizationTables(header);return{...base,quality:evidence.quality,evidence,calibrationRequired:evidence.quality!==null};}
 if(header?.format==='jpeg')fail('Original JPEG tables are missing; a damaged header cannot become a pixel estimate silently.');
 if(width<8||height<8)return{...base,evidence:{kind:'native-pixel-quantization',status:'insufficient-native-blocks'},calibrationRequired:false};
 if(typeof readRect!=='function'||typeof reserveMemory!=='function')fail('Bounded native readRect and memory admission callbacks are required.');
 const compiled=compileForgeryscopeScientificScope(scope,{width,height,sourceSha256}),release=await reserveMemory(WORKSPACE);if(typeof release!=='function')fail('Memory admission must return a release function.');
 const patches=[];let failure,nextYield=performance.now()+8;
 const cooperate=async()=>{checkAbort(signal);if(performance.now()>=nextYield){await controlCheckpoint(signal);nextYield=performance.now()+8;}};
 try{
  const plan=patchPlan(width,height),basis=weights();for(let i=0;i<plan.length;i++){await controlCheckpoint(signal);const rect=plan[i],part=await readRect(rect,{signal}),pixels=part?.pixels??part;try{if(pixels?.width!==rect.width||pixels.height!==rect.height||pixels.format!=='rgb8'||!(pixels.data instanceof Uint8Array)||pixels.data.length!==rect.width*rect.height*3)fail('Native source window dimensions differ from the requested pixels.');patches.push({rect,data:pixels.data.slice()});}finally{await part?.release?.();}onProgress?.({phase:'native-block-samples',fraction:.05*(i+1)/plan.length});}
  const scouts=[],scoutPatches=patches.filter((_,i)=>i%Math.max(1,Math.floor(patches.length/4))===0).slice(0,4);
  for(let index=0;index<64;index++){await controlCheckpoint(signal);const phase={x:index%8,y:Math.floor(index/8)},grid=nativeCoefficients(scoutPatches,phase,SCOUT,256,compiled,basis),records=[];
   for(let i=0;i<SCOUT.length;i++)records.push({frequency:SCOUT[i],...await coefficientEvidence(grid.values[i],grid.count,cooperate)});
   scouts.push({phase,blocks:grid.count,...phaseStrength(records),candidateQualities:[...new Set(standardCandidates(records).map(c=>c.quality))]});onProgress?.({phase:'jpeg-grid-phases',fraction:.05+.65*(index+1)/64});
  }
  scouts.sort((a,b)=>b.meaningful-a.meaningful||b.strength-a.strength);const best=scouts[0],policy={id:'native-stratified-quantization-nfa-v1',sampling:'8x8-original-blocks; no resize or recompression',maximumPatches:MAX_PATCHES,maximumNativeBlocks:1024,scoutNativeBlocks:256,phasesTested:64,sampleDomainsTested:2,minimumNonzeroSamples:MIN_SAMPLES,tests:SEARCH_TESTS,scopeFingerprint:scope?.fingerprint??null};
  if(best.meaningful===0)return{...base,evidence:{kind:'native-pixel-quantization',status:'no-meaningful-quantization-trace',policy,phases:scouts},calibrationRequired:false};
  const frequencies=Array.from({length:63},(_,i)=>i+1),grid=nativeCoefficients(patches,best.phase,frequencies,1024,compiled,basis),records=[];
  for(let i=0;i<frequencies.length;i++){records.push({frequency:frequencies[i],...await coefficientEvidence(grid.values[i],grid.count,cooperate)});onProgress?.({phase:'quantization-table-evidence',fraction:.7+.3*(i+1)/63});}
  checkAbort(signal);const candidates=standardCandidates(records),qualities=[...new Set(candidates.map(c=>c.quality))],meaningful=records.filter(r=>r.step!==null).length,competing=scouts.filter(p=>p!==best&&p.meaningful===best.meaningful&&p.strength>=best.strength*.95&&p.candidateQualities.some(q=>!qualities.includes(q))),quality=qualities.length===1&&meaningful>=SCOUT.length&&competing.length===0?qualities[0]:null;
  const encodedRecords=records.map(r=>Number.isFinite(r.logNfa)?r:{...r,logNfa:null,logNfaBound:r.logNfa<0?'-Infinity':'Infinity'});
  return{...base,quality,calibrationRequired:quality!==null,evidence:{kind:'native-pixel-quantization',status:quality!==null?'IJG-compatible-statistical-trace':qualities.length||competing.length?'ambiguous-quantization-trace':'non-IJG-or-inconsistent-trace',policy,gridPhase:{...best.phase},sampledBlocks:grid.count,excludedBlocks:grid.excluded,nativeBlockCoordinates:grid.coordinates,meaningfulCoefficients:meaningful,minimumMeaningfulCoefficients:SCOUT.length,candidateQualities:qualities,candidates,records:encodedRecords,phases:scouts,competingPhases:competing.map(p=>p.phase),qualityMeaning:'Candidate recompression reference matching sampled luminance steps; not proof of unique history or last save quality.',confidenceMeaning:'Per-coefficient false-alarm bounds under the published null model; assumed IJG luminance tables. Not original quality certainty or authenticity.',limitations:['Lossless storage does not prove absence of previous JPEG compression.','Resizing, noise, nonstandard tables and multiple compression histories can make inference ambiguous.','The bounded phase scout is this implementation’s policy, not a qualification of the original IPOL software.']}};
 }catch(error){failure=error;throw error;}finally{try{await release();}catch(cleanup){if(!failure)throw cleanup;failure.details={...failure.details,cleanup:{message:cleanup.message,code:cleanup.code}};}}
}

/** Visibility recommendation from a real native absolute-RGB-error sample.
 * It is explicitly not a forgery detector or an estimator of compression Q.
 * Contrast0 preserves every nonzero error before display quantization. */
export function calibrateElaClassicDisplay(sample,params,{percentile=.995,target=225}={}){
 const p=validateParams(params),{width,height,data}=sample??{};if(sample?.format!=='rgb8'||!(data instanceof Uint8Array)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>320||height>320||data.length!==width*height*3||!Number.isFinite(percentile)||percentile<=0||percentile>1||!Number.isInteger(target)||target<1||target>254)fail('A bounded real native absolute-error sample is required.');
 const histogram=new Uint32Array(256);for(const value of data)histogram[value]++;
 return calibrateElaClassicHistogram(histogram,p,{percentile,target});
}

/** Same visibility rule, accumulated from admitted native samples only. No
 * zero-padded raster or excluded presentation pixels enter this histogram. */
export function calibrateElaClassicHistogram(histogram,params,{percentile=.995,target=225}={}){
 const p=validateParams(params);
 if(!(histogram instanceof Uint32Array)||histogram.length!==256||!Number.isFinite(percentile)||percentile<=0||percentile>1||!Number.isInteger(target)||target<1||target>254)fail('A bounded native absolute-error histogram is required.');
 const count=histogram.reduce((n,v)=>n+v,0);if(!Number.isSafeInteger(count)||count<1)fail('A nonempty native absolute-error histogram is required.');
 const rank=Math.max(1,Math.ceil(percentile*count));let cumulative=0,quantile=0;for(let i=0;i<256;i++){cumulative+=histogram[i];if(cumulative>=rank){quantile=i;break;}}
 const nonzero=count-histogram[0];if(nonzero===0||quantile===0)return{status:'no-calibratable-residual',params:{...p},qualityEstimated:false,displayRule:'native absolute error sample has no supported percentile',nonzeroChannels:nonzero,samples:count};
 const base=p.linear?quantile:Math.fround(Math.sqrt(Math.fround(quantile/255))*255),gain=p.linear?target/base:20*target/base,scale=Math.max(1,Math.min(100,Math.floor(gain))),contrast=0,factor=Math.fround(p.linear?scale:scale/20);let clipped=0,black=0;
 for(let value=0;value<256;value++){const b=p.linear?value:Math.fround(Math.sqrt(Math.fround(value/255))*255),shown=Math.round(Math.fround(b*factor));if(shown>=255)clipped+=histogram[value];if(shown<.5)black+=histogram[value];}
 return{status:'visibility-calibrated',params:{...p,scale,contrast},qualityEstimated:false,displayRule:'native absolute RGB error percentile; contrast0; largest integer gain not exceeding target',percentile,target,rawQuantile:quantile,samples:count,nonzeroChannels:nonzero,estimatedSaturationFraction:clipped/count,estimatedBlackFraction:black/count,preservedPreferences:{linear:p.linear,grayscale:p.grayscale},nonlinearQualification:p.linear?'exact integer residual/gain arithmetic':'Magnitude-based estimate; final native rendering preserves per-operand Float32 arithmetic.',grayscaleQualification:p.grayscale?'Channel-based visibility statistics; final grayscale conversion remains native.':'RGB-channel visibility statistics.'};
}

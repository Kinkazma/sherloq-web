import {EngineError,checkAbort} from './unified-engine/src/errors.js';
const MAX_ELEMENTS=262144;
const type=name=>name==='energy_scope'||name==='energy_labels'||name==='analysis_scope'?Int32Array:Float32Array;
function plane(analysis,name){const d=analysis.data??{},match=/^energy_plane_(\d)$/.exec(name),value=match?(Array.isArray(d.energy_planes)?d.energy_planes[+match[1]]:d.energy_planes):d[name];return{value,offset:match&&!Array.isArray(d.energy_planes)&&ArrayBuffer.isView(value)?+match[1]*d.width*d.height:0,surface:analysis.planeSurfaces?.[name]??(name==='energy_low_score'?analysis.surface:null)};}
export function energyFieldAvailable(analysis,name){const f=plane(analysis,name),Type=type(name),n=analysis.data.width*analysis.data.height;return f.value instanceof Type&&f.value.length>=f.offset+n||f.surface?.width===analysis.data.width&&f.surface.height===analysis.data.height;}
/** The caller admits its destination. Engine plane windows stay <=one MiB;
 * samples remain exact native values and never become scientific observations. */
export async function readEnergyWindow(analysis,name,rect,{engine,signal}={}){
 checkAbort(signal);const d=analysis.data,{x,y,width,height}=rect,Type=type(name),f=plane(analysis,name);
 if(![x,y,width,height].every(Number.isSafeInteger)||x<0||y<0||width<1||height<1||x+width>d.width||y+height>d.height||width*height>MAX_ELEMENTS)throw new EngineError('INVALID_INPUT','Invalid bounded native energy window.');
 if(f.value instanceof Type){if(f.value.length<f.offset+d.width*d.height)throw new EngineError('INVALID_INPUT','Native energy field dimensions differ.');if(width===d.width)return f.value.subarray(f.offset+y*d.width,f.offset+(y+height)*d.width);const output=new Type(width*height);for(let row=0;row<height;row++){const from=f.offset+(y+row)*d.width+x;output.set(f.value.subarray(from,from+width),row*width);}return output;}
 if(!f.surface)throw new EngineError('DRAFT_BASE_UNAVAILABLE','The retained native energy field is unavailable.');const answer=await engine.readPlane({surfaceId:f.surface.id,revision:f.surface.revision,rect},{signal});checkAbort(signal);const p=answer.plane;
 if(!p||p.width!==width||p.height!==height||!(p.data instanceof Type)||p.data.length!==width*height)throw new EngineError('INVALID_INPUT','Retained energy plane changed its native grid or dtype.');return p.data;
}
export async function sampleEnergyField(analysis,name,{width,height,step,centers=false},{engine,signal}={}){
 const d=analysis.data,Type=type(name);if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=2048)||!centers&&(!Number.isSafeInteger(step)||step<1))throw new EngineError('INVALID_INPUT','Invalid sampled energy field.');const output=new Type(width*height),xs=Array.from({length:width},(_,x)=>centers?Math.min(d.width-1,Math.floor((x+.5)*d.width/width)):x*step);
 for(let y=0;y<height;y++){checkAbort(signal);const sy=centers?Math.min(d.height-1,Math.floor((y+.5)*d.height/height)):y*step;for(let start=0;start<width;){let end=start+1;while(end<width&&xs[end]-xs[start]<MAX_ELEMENTS)end++;const row=await readEnergyWindow(analysis,name,{x:xs[start],y:sy,width:xs[end-1]-xs[start]+1,height:1},{engine,signal});for(let x=start;x<end;x++)output[y*width+x]=row[xs[x]-xs[start]];start=end;}}
 return output;
}
const histogramViews=new WeakMap();
export function energyHistogramAnalysis(analysis,engine){if(!analysis.planeSurfaces)return analysis;if(histogramViews.has(analysis))return histogramViews.get(analysis);const field=name=>({descriptor:analysis.planeSurfaces[name]??(name==='energy_low_score'?analysis.surface:null),width:analysis.data.width,height:analysis.data.height,async readWindow(rect,{signal}={}){return{plane:{width:rect.width,height:rect.height,data:await readEnergyWindow(analysis,name,rect,{engine,signal})},release(){}};}});const wrapped={...analysis,data:{...analysis.data,...Object.fromEntries(['energy_scope','energy_low_score','energy_high_score'].map(name=>[name,field(name)])),energy_planes:[0,1,2].map(i=>field('energy_plane_'+i))}};histogramViews.set(analysis,wrapped);return wrapped;}

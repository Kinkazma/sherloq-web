// Native automatic_clones.parameters and widget submission rules. This module
// only plans real detector work; it neither detects panels nor fabricates results.
import {requireValue} from './errors.js';
import {roundDecimal} from './energy-auto.js';
import {SIFT_SOURCE} from './clone-relations.js';

export const AUTOMATIC_DENSE_PROFILE='Extended: PatchMatch Zernike + PatchMatch SIFT + Mirror';
const same=(a,b)=>a!==null&&b!==null&&a.length===b.length&&a.every((p,i)=>p[0]===b[i][0]&&p[1]===b[i][1]);
function dimensions(width,height){requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&width<=2**30&&height<=2**30,'Invalid automatic analysis dimensions');}
function polygon(value){
 requireValue(Array.isArray(value)&&value.length>=3&&value.every(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(x)&&Math.abs(x)<=2**30)),'Finite automatic analysis polygon required');
 return value.map(p=>p.slice()); // Selection coordinates remain float64.
}
function bounds(regions){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const region of regions)for(const [x,y] of region){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return[x0,y0,x1,y1];}

/** Apply only after a successful panel detection (an empty result is valid).
 * Re-editing or disabling this selection must not call this fallback again. */
export function automaticSelection(width,height,detected){
 dimensions(width,height);requireValue(Array.isArray(detected),'Completed panel detection required');
 const regions=detected.map(polygon);let envelope;
 if(!regions.length){envelope=[[0,0],[width-1,0],[width-1,height-1],[0,height-1]];regions.push(envelope);}
 else{const [x0,y0,x1,y1]=bounds(regions);envelope=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];if(!regions.some(r=>same(r,envelope)))regions.push(envelope);}
 return structuredClone({regions,envelope,disabled:[]});
}

/** Owned native submission and M3/M4 parameter objects, in source pixel centres.
 * Forgeryscope/D2PRL remain native selection contracts pending ROI adaptation.
 * Consumers MUST honor enabled: false, especially when all zones are disabled. */
export function automaticAnalysisPlan({width,height,regions,envelope=null,disabled=[],cpu=false,complete=false,d2Minimum=500}){
 dimensions(width,height);requireValue(Array.isArray(regions)&&Array.isArray(disabled)&&disabled.every(i=>Number.isSafeInteger(i)&&i>=0&&i<regions.length),'Invalid automatic selection');
 requireValue(typeof cpu==='boolean'&&typeof complete==='boolean'&&Number.isInteger(d2Minimum)&&d2Minimum>=0&&d2Minimum<=5000,'Invalid automatic analysis controls');
 regions=regions.map(polygon);envelope=envelope===null?null:polygon(envelope);const off=new Set(disabled);
 const active=regions.filter((_,i)=>!off.has(i)),excluded=regions.filter((r,i)=>off.has(i)&&!same(r,envelope));
 const guides=regions.some(r=>same(r,envelope))?active.filter(r=>!same(r,envelope)):[];
 const diagonal=Math.hypot(height,width);let radius=diagonal;
 if(active.length){radius=0;for(const region of active){const [x0,y0,x1,y1]=bounds([region]),dx=x1-x0,dy=y1-y0;radius=Math.max(radius,Math.sqrt(dx*dx+dy*dy));}}
 radius=roundDecimal(radius,2);
 const patchmatch=[AUTOMATIC_DENSE_PROFILE,6000,radius,5,.3,Math.min(50,diagonal),'Similarity',3,6,8,8,true,2,cpu,true,true,excluded,guides];
 const sift=patchmatch.slice();sift[0]=SIFT_SOURCE;sift[3]=10;sift[4]=.725;sift.splice(6,3,'Affine',5,10);sift[11]=true;sift[15]=false;
 const forge={variant:'Forgeryscope Auto',regions:active.some(r=>same(r,envelope))?[envelope]:[],selection_present:true,compare:false,excluded};
 const unique=[];for(const region of active)if(!unique.some(r=>same(r,region)))unique.push(region);
 const d2={...forge,variant:'D2PRL',regions:unique};
 const denseParams={profile:patchmatch[0],limit:patchmatch[1],radius,minimum:5,threshold:.3,tolerance:patchmatch[5],model:'Similarity',geometricThreshold:3,geometricMinimum:6,patch:8,iterations:8,flip:true,texture:2,auto:true,compact:true,regions:active,excluded,guides,compare:false};
 const sparseParams={algorithm:SIFT_SOURCE,limit:6000,radius,minimum:10,threshold:.725,tolerance:patchmatch[5],model:'Affine',geometricThreshold:5,geometricMinimum:10,reflections:true,autoRadius:true,compact:false,regions:active,excluded,guides,compare:false,independent:true};
 const enabled=active.length>0;
 const jobs=[{id:'patchmatch',enabled,params:denseParams},{id:'sift',enabled,params:sparseParams},{id:'forgeryscope',enabled:enabled&&forge.regions.length>0,params:forge},{id:'d2prl',enabled,params:d2,minimum:d2Minimum}];
 if(complete)jobs.push({id:'ela',enabled,params:{regions:active,excluded}});
 for(const job of jobs)job.state=job.enabled?'pending':enabled?'envelope-disabled':'no-active-zones';
 return structuredClone({version:2,width,height,complete,cpu,regions,envelope,disabled:[...off].sort((a,b)=>a-b),active,excluded,guides,native:{patchmatch,sift,forgeryscope:forge,d2prl:d2},jobs});
}

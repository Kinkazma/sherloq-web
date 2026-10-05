import "../../runtime-context.js?v=0.14.5";
import {forgeryscopeMaskField} from './forgeryscope-segmented-result.js';
import {checkAbort,checkpoint,requireValue} from './errors.js';
import {selectForgeryscopePanels,planForgeryscopeComparisons,classifyForgeryscopeMatch,laneOverlapGroups,bestLaneMatches,writeLaneUnion,FORGERYSCOPE_PROFILES,FORGERYSCOPE_THRESHOLDS} from './forgeryscope-decisions.js';
import {duplicateEvidence,writeDuplicateUnion} from './forgeryscope-geometry.js';
import {forgeryscopeCliqueGroups} from './forgeryscope-cliques.js';
import {cropForgeryscopeRGB} from './forgeryscope-networks.js';
import {forgeryscopeSimilarityRow,normalizeLaneEmbeddings} from './forgeryscope-similarity.js';

/** Full public orchestration, with real network stages injected by the runtime.
 * No connected-component or geometric substitute for missing feature extractors.
 * The caller must release the returned admitted dense outputs after export/view.
 */
export async function analyzeForgeryscope(image,{networks,budget,pool,profile='auto',panels:manualPanels,exclusions=[],signal,onProgress,backend='auto',segmentedResult=false,inputAlreadyBudgeted=false}={}){
  requireValue(image.data instanceof Uint8Array&&Number.isSafeInteger(image.width)&&Number.isSafeInteger(image.height)&&image.width>0&&image.height>0&&image.data.length===image.width*image.height*3,'Forgeryscope requires original RGB8.');
  requireValue(Object.hasOwn(FORGERYSCOPE_PROFILES,profile),'Invalid Forgeryscope profile.');
  requireValue(profile!=='auto'||manualPanels===undefined,'Auto classifies its own panels; use a standalone profile for paired panels.');
  const options={signal,backend,onProgress,segmentedAliked:segmentedResult},n=image.width*image.height,inputBytes=inputAlreadyBudgeted?0:image.data.byteLength,outputBytes=n*(profile==='auto'?(segmentedResult?6:10):(segmentedResult?2:6));
  // Admit the full live envelope before allocating either half. A retry must
  // not mistake rolling back its own input credit for new room for the output.
  const releaseInput=budget.reserve(inputBytes+outputBytes),releaseOutput=releaseInput.split(outputBytes);let complete=false;
  try{
  const mask=new Uint8Array(n),candidates=new Uint8Array(n),auto=profile==='auto';
  const geometric=auto?new Uint8Array(n):null,branches=auto?Object.fromEntries(['microscopy','blots','lanes'].map(name=>[name,new Uint8Array(n)])):null;
  const meta={profile:FORGERYSCOPE_PROFILES[profile],public_simplified:true,panels:[],comparisons:[],embedding_candidates:[],manual_panels:manualPanels!==undefined,status:'no_panels',thresholds:{...FORGERYSCOPE_THRESHOLDS},competition_ensemble:false,segmentation_fallback:false};
  const progress=(phase,completed,total)=>{checkAbort(signal);onProgress?.({phase,completed,total,fraction:total?completed/total:0});};
  function crop(box){
    const bytes=Math.max(0,Math.trunc(box[2])-Math.trunc(box[0]))*Math.max(0,Math.trunc(box[3])-Math.trunc(box[1]))*3,release=budget.reserve(bytes);
    try{return {...cropForgeryscopeRGB(image,box),release};}catch(e){release();throw e;}
  }
  async function vectorsFor(items,name,load){
    const release=budget.reserve(items.length*4096),values=new Float32Array(items.length*1024);let completed=false,batchSize=Math.min(8,items.length);
    try{
      for(let start=0;start<items.length;){
        const batch=[],count=Math.min(batchSize,items.length-start);let embedded;
        try{
          for(let j=0;j<count;j++)batch.push(load(items[start+j]));
          embedded=await networks.embed(batch,name,options);values.set(embedded.vectors,start*1024);start+=count;progress('embedding:'+name,start,items.length);
        }catch(error){if(['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error.code)&&count>1){batchSize=Math.max(1,Math.floor(count/2));continue;}throw error;}
        finally{embedded?.release();for(const b of batch)b.release();}
      }
      completed=true;return {values,release};
    }finally{if(!completed)release();}
  }
  async function similar(label,name,threshold,panels){
    const ids=panels.flatMap((p,i)=>p[0]===label?[i]:[]);if(ids.length<2)return [];
    const vectors=await vectorsFor(ids,name,i=>crop(panels[i].slice(-4))),pairs=[];
    try{
      for(let i=0;i<ids.length;i++){
        const row=await forgeryscopeSimilarityRow(pool,vectors.values,i,options);
        try{for(let j=i+1;j<ids.length;j++)if(row.scores[j]>=threshold)pairs.push({panel0:ids[i],panel1:ids[j],score:row.scores[j]});}
        finally{row.release();}
      }
      return pairs;
    }finally{vectors.release();}
  }
  async function lanes(panels){
    const lanes=[];
    for(let p=0;p<panels.length;p++)if(panels[p][0]==='Blots'){
      const c=crop(panels[p].slice(-4));
      try{
        const boxes=await networks.detect(c,'lanes',options);
        for(const b of boxes)lanes.push({panel_idx:p,bbox:b.slice(0,4),global_idx:lanes.length,panel_bbox:panels[p]});
      }finally{c.release();}
    }
    if(!lanes.length)return {lanes,matches:[]};
    const vectors=await vectorsFor(lanes,'wblot_lane_embedder',lane=>{
      const p=crop(panels[lane.panel_idx].slice(-4));let release;
      try{
        const b=lane.bbox.map(Math.trunc);release=budget.reserve(Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1])*3);
        return {...cropForgeryscopeRGB(p,b),release};
      }catch(e){release?.();throw e;}finally{p.release();}
    });
    let row;const normalizedRelease=budget.reserve(vectors.values.byteLength);
    try{
      const normalized=normalizeLaneEmbeddings(vectors.values),score=(_,j)=>row.scores[j];
      score.prepareRow=async i=>{row?.release();row=await forgeryscopeSimilarityRow(pool,normalized,i,options);};
      const matches=await bestLaneMatches(lanes,laneOverlapGroups(lanes),score,{signal});
      return {lanes,matches};
    }finally{row?.release();normalizedRelease();vectors.release();}
  }
    progress('panels',0,1);
    const selection=selectForgeryscopePanels(manualPanels??await networks.detect(image,'panels',options),{profile,exclusions}),panels=selection.panels;
    requireValue(auto||panels.length<=64,'More than 64 panels: select smaller source regions.');
    Object.assign(meta,{panels,excluded_panels:selection.excludedPanels,excluded_boxes:exclusions});
    if(auto)Object.assign(meta,{merged_groups:[],lane_search:false,lane_matches:0});
    progress('panels',1,1);
    if(!panels.length||(!auto&&profile!=='lanes'&&panels.length<2))meta.status=panels.length?'insufficient_panels':'no_panels';
    else{
      const scores={};
      if(auto||profile==='overlap')scores.overlap=await similar('Blots','wblot_overlap_embedder',.85,panels);
      if(auto||profile==='duplicate')scores.duplicate=await similar('Blots','wblot_duplicate_embedder',.84,panels);
      if(auto||profile==='microscopy')scores.microscopy=await similar('Microscopy','micro_overlap_embedder',.58,panels);
      const plan=planForgeryscopeComparisons(panels,{profile,...scores});
      requireValue(auto||plan.comparisons.length<=256,'More than 256 panel comparisons: select smaller regions.');
      meta.embedding_candidates=plan.comparisons.map(r=>({...r}));
      const accepted=[];
      for(let i=0;i<plan.comparisons.length;i++){
        await checkpoint(signal);progress('geometry',i,plan.comparisons.length);
        const pair=plan.comparisons[i],a=crop(panels[pair.panel0].slice(-4));let b;
        try{
          b=crop(panels[pair.panel1].slice(-4));
          const match=await networks.match(a,b,pair.label,options),info=duplicateEvidence(match,panels[pair.panel0],panels[pair.panel1],pair.panel0,pair.panel1);
          if(!info)continue;
          const decision=classifyForgeryscopeMatch(info.match_result,pair.label,{profile});
          if(decision.accepted){await writeDuplicateUnion(mask,image.width,image.height,info,{signal});if(auto){accepted.push(info);await writeDuplicateUnion(branches[decision.branch],image.width,image.height,info,{signal});}}
          if(decision.candidate)await writeDuplicateUnion(candidates,image.width,image.height,info,{signal});
          if(auto&&decision.supported)await writeDuplicateUnion(geometric,image.width,image.height,info,{signal});
          meta.comparisons.push({panel0:pair.panel0,panel1:pair.panel1,...decision,inliers:info.match_result.inliers,score:info.match_result.mean_match_score,matrix:info.match_result.H??null,polygon0:info.poly_coords0,polygon1:info.poly_coords1,fallback:info.match_result.fallback??null});
        }finally{a.release();b?.release();}
      }
      if(auto)meta.merged_groups=(await forgeryscopeCliqueGroups(accepted,{signal})).map(g=>({panel_ids:g.panel_ids,n_pairs:g.n_pairs,total_inliers:g.total_inliers,avg_match_score:g.avg_match_score,polygons:g.all_poly_coords}));
      if(plan.laneSearch){
        if(auto)meta.lane_search=true;
        const result=await lanes(panels),target=auto?branches.lanes:candidates,display=writeLaneUnion(target,image.width,image.height,result.lanes,result.matches,{exclusions});
        meta.lanes=result.lanes.length;meta.lane_matches=result.matches.length;
        if(auto){
          for(let i=0;i<n;i++){candidates[i]|=target[i];mask[i]|=target[i];}
          const polygon=([x,y,r,b])=>[[x,y],[r,y],[r,b],[x,b]];
          meta.lane_pairs=result.matches.map((m,i)=>({panel0:m.panel_idx1,panel1:m.panel_idx2,score:m.similarity,evidence:'embedding',polygon0:polygon(m.bbox1_absolute),polygon1:polygon(m.bbox2_absolute),display_polygon0:polygon(display.pairs[i].box0??m.bbox1_absolute),display_polygon1:polygon(display.pairs[i].box1??m.bbox2_absolute)}));
        }
      }
      if(auto)for(const box of exclusions){
        const [x,y,r,b]=box.map(Math.trunc);
        for(const target of [mask,candidates,geometric,...Object.values(branches)])for(let yy=Math.max(0,y);yy<Math.min(image.height,b);yy++)target.fill(0,yy*image.width+Math.max(0,x),yy*image.width+Math.min(image.width,r));
      }
      meta.status=mask.some(Boolean)?'ok':!auto&&candidates.some(Boolean)?'candidates':'empty';
    }
    meta.mask_semantics=auto?'published pipeline: microscopy geometry, blot and lane similarity evidence':profile==='lanes'?'embedding-supported lane candidates; no geometric verification':'geometric overlap envelopes, not pixel segmentation';
    progress('complete',1,1);checkAbort(signal);
    const result={mask,map:segmentedResult?forgeryscopeMaskField(mask,{floating:true}):Float32Array.from(mask),candidates,metadata:meta,release:releaseOutput};
    if(auto)Object.assign(result,{geometric,...Object.fromEntries(Object.entries(branches).map(([name,value])=>['branch_'+name,value]))});
    complete=true;return result;
  }finally{releaseInput();if(!complete)releaseOutput();}
}

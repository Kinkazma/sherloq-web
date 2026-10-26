const SVG='http://www.w3.org/2000/svg';
const schema='sherloq.energy-histogram/1';
const plot={left:8,right:280,top:4,bottom:43,width:288,height:59};
const labels={energyHistogramTitle:'Native histograms',energyHistogramPanel:'Panel',energyHistogramReference:'Residual energy · gray, 7×7',energyHistogramScores:'Signed score · high − low',energyHistogramLog:'log scale',energyHistogramNative:'Native curves',energyHistogramDraft:'Provisional settings · native curves retained',energyHistogramLoading:'Updating native curves…',energyHistogramEmpty:'Available after a native Biome calculation',energyHistogramNoReference:'No reference panel',energyHistogramPixels:'pixels',energyHistogramZeros:'zeros included',energyHistogramMean:'trimmed mean',energyHistogramNativeMean:'native trimmed mean',energyHistogramRequested:'requested percentiles',energyHistogramNativeCuts:'native cutoffs',energyHistogramApproximate:'approximate preview cutoffs',energyHistogramBinPrecision:'native bins; uncertainty ≤',energyHistogramThresholds:'strong thresholds',energyHistogramOutside:'outside the plotted range',energyHistogramReferenceRule:'Native reference-panel rectangle; original gray strictly between 3 and 252.',energyHistogramScoreRule:'All native pixels with energy_scope > 0, including zero scores. Score = high − low.'};

function binnedQuantile(hist,q){
 if(!hist.count||!Number.isFinite(q)||q<0||q>1)return undefined;
 const minimum=hist.observed?.minimum,maximum=hist.observed?.maximum;
 const clamp=value=>Math.max(Number.isFinite(minimum)?minimum:-Infinity,Math.min(Number.isFinite(maximum)?maximum:Infinity,value));
 if(q===0&&Number.isFinite(minimum))return minimum;if(q===1&&Number.isFinite(maximum))return maximum;
 // Match native's (N−1)q ranks. Estimating the two neighbouring order
 // statistics inside their actual bins bounds error by one bin width, even
 // when a large empty interval separates those ranks.
 const order=index=>{let before=0;for(let i=0;i<hist.counts.length;i++){const count=hist.counts[i];if(index<before+count)return clamp(hist.edges[i]+(hist.edges[i+1]-hist.edges[i])*(index-before+.5)/count);before+=count;}return clamp(hist.edges.at(-1));};
 const rank=(hist.count-1)*q,lo=Math.floor(rank),a=order(lo),b=order(Math.min(lo+1,hist.count-1));return a+(b-a)*(rank-lo);
}

export function nativeEnergyContextUnavailableText(context,language='fr'){
 if(context?.evaluable!==false)return null;
 const dimensions=Array.isArray(context.nativeDimensions)&&context.nativeDimensions.length===2?' · '+context.nativeDimensions.join('×'):'';
 return(language==='fr'?'Aucun score : aucun rectangle entièrement admis ne satisfait le minimum natif de 25 cellules complètes.':'No score: no wholly admitted rectangle meets the native minimum of 25 complete cells.')+dimensions;
}

// This view only consumes small native histograms. Provisional percentile cuts
// are explicitly estimated from these bins; no image pixels are sampled here.
export function createEnergyHistogramUI({root,document=root?.ownerDocument??globalThis.document,t=key=>labels[key]??key,onSelection=()=>{},contextHost=null}){
 const find=id=>root?.getElementById?.(id)??root?.querySelector?.('#'+id);
 const host=find('energy-histograms')??(root?.id==='energy-histograms'?root:null);
 // Embedded panels pass a scoped document facade; SVG creation belongs to the
 // host's real document while lookups and events stay inside this panel.
 if(!document?.createElementNS)document=host?.ownerDocument??document;
 if(!host||!document?.createElementNS)throw new TypeError('An energy-histograms host and DOM document are required.');
 const tr=key=>{const value=t(key);return value&&value!==key?value:labels[key]??key;};
 const format=value=>Number.isFinite(value)?new Intl.NumberFormat(document.documentElement?.lang||undefined,{maximumFractionDigits:3}).format(value):'—';
 const element=(tag,attrs={},text)=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
 const svgElement=(tag,attrs={},text)=>{const node=document.createElementNS(SVG,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
 const header=element('div',{class:'energy-histogram-selectors'}),panelLabel=element('label'),qualityLabel=element('label');
 const contextLabel=element('label'),context=element('select',{id:'energy-histogram-context'}),contextText=element('span');contextLabel.append(contextText,context);contextLabel.hidden=true;(contextHost??header).append(contextLabel);
 const panel=element('select',{id:'energy-histogram-panel'}),quality=element('select',{id:'energy-histogram-quality'}),status=element('p',{id:'energy-histogram-status',class:'energy-histogram-status','role':'status'});
 panelLabel.append(element('span',{'data-histogram-label':'energyHistogramPanel'},tr('energyHistogramPanel')),panel);qualityLabel.append(element('span',{},'Q'),quality);header.append(panelLabel,qualityLabel);
 function card(kind,key){const node=element('section',{class:'energy-histogram-card','data-histogram':kind}),heading=element('div',{class:'energy-histogram-heading'}),title=element('strong',{'data-histogram-label':key},tr(key)),scale=element('span',{'data-histogram-label':'energyHistogramLog'},tr('energyHistogramLog')),svg=svgElement('svg',{id:'energy-histogram-'+kind,viewBox:`0 0 ${plot.width} ${plot.height}`,role:'img',preserveAspectRatio:'none'}),detail=element('p',{id:'energy-histogram-'+kind+'-detail',class:'energy-histogram-detail'});heading.append(title,scale);node.append(heading,svg,detail);return {node,svg,detail};}
 const reference=card('reference','energyHistogramReference'),scores=card('scores','energyHistogramScores');
 host.replaceChildren(header,reference.node,scores.node,status);host.setAttribute('aria-label',tr('energyHistogramTitle'));
 let native=null,contextList=[],selection={referencePanelId:null,qualityIndex:null},requested=null,binnedGesture=false,locked=false,disposed=false;
 const listeners=[];
 function listen(node,type,handler){node.addEventListener(type,handler);listeners.push(()=>node.removeEventListener(type,handler));}
 function controls(){context.disabled=locked||!contextList.length;panel.disabled=locked||!native?.panels.length;quality.disabled=locked||!native?.source.qualities.length;host.setAttribute('aria-busy',String(locked));}
 function statusText(){if(native?.contextStatus?.evaluable===false){status.textContent=nativeEnergyContextUnavailableText(native.contextStatus,document.documentElement?.lang);return;}status.textContent=tr(!native?'energyHistogramEmpty':requested?.draft?'energyHistogramDraft':locked?'energyHistogramLoading':'energyHistogramNative');}
 function number(value,fallback){return Number.isFinite(value)?value:fallback;}
 function histogram(input,available=true){
  if(!available)return null;
  const counts=Array.from(input?.counts??[]),edges=Array.from(input?.edges??[]);
  if(!counts.length||counts.length>512||edges.length!==counts.length+1||counts.some(n=>!Number.isSafeInteger(n)||n<0)||edges.some((n,i)=>!Number.isFinite(n)||i>0&&n<=edges[i-1])||!Number.isSafeInteger(input.count)||input.count<0||counts.reduce((a,b)=>a+b,0)!==input.count)throw new TypeError('Invalid native histogram.');
  return {...input,edges,counts,probe:input.probe?{...input.probe}:undefined,cuts:input.cuts?.map(cut=>({...cut})),quantiles:input.quantiles?[...input.quantiles]:undefined,observed:input.observed?{...input.observed}:undefined,markers:input.markers?.map(marker=>({...marker}))};
 }
 function xFor(value,hist){const first=hist.edges[0],last=hist.edges.at(-1);return plot.left+(Math.max(first,Math.min(last,value))-first)/(last-first)*(plot.right-plot.left);}
 function marker(group,hist,{kind,value,label,draft=false,estimate}){
  if(!Number.isFinite(value))return;
  const x=xFor(value,hist),clipped=value<hist.edges[0]||value>hist.edges.at(-1),line=svgElement('line',{x1:x,x2:x,y1:plot.top,y2:plot.bottom,class:'energy-histogram-marker '+kind+(draft?' draft':''),'data-marker':kind,'data-value':value,'data-clipped':clipped});
  if(estimate)line.setAttribute('data-estimate',estimate);line.append(svgElement('title',{},`${label}: ${format(value)}${clipped?' · '+tr('energyHistogramOutside'):''}`));group.append(line);
  if(clipped)group.append(svgElement('text',{x,y:11,'text-anchor':value<hist.edges[0]?'start':'end',class:'energy-histogram-overflow '+kind},value<hist.edges[0]?'‹':'›'));
 }
 function curve(card,hist,kind){
  card.svg.replaceChildren();
  if(!hist){card.svg.removeAttribute('data-count');card.svg.setAttribute('aria-label',tr('energyHistogramNoReference'));return;}
  const bars=svgElement('g',{'data-layer':'counts'}),axis=svgElement('g',{'data-layer':'axis'}),markers=svgElement('g',{'data-layer':'markers'}),maximum=Math.max(0,...hist.counts),logMax=Math.log1p(maximum)||1;
  for(let i=0;i<hist.counts.length;i++){
   const count=hist.counts[i];if(!count)continue;
   const x0=xFor(hist.edges[i],hist),x1=xFor(hist.edges[i+1],hist),height=Math.log1p(count)/logMax*(plot.bottom-plot.top),center=(hist.edges[i]+hist.edges[i+1])/2;
   const zeroBin=hist.zeroCount>0&&hist.edges[i]<=0&&hist.edges[i+1]>0;
   const bar=svgElement('rect',{x:x0,y:plot.bottom-height,width:Math.max(.1,x1-x0),height,class:'energy-histogram-bar '+(kind==='scores'?(zeroBin?'neutral':center<0?'low':center>0?'high':'neutral'):'neutral'),'data-bin':i,'data-count':count});
   bar.append(svgElement('title',{},`${format(hist.edges[i])}…${format(hist.edges[i+1])}: ${format(count)} ${tr('energyHistogramPixels')}`));bars.append(bar);
  }
  axis.append(svgElement('line',{x1:plot.left,x2:plot.right,y1:plot.bottom,y2:plot.bottom,class:'energy-histogram-axis'}));
  const ticks=[hist.edges[0],...(kind==='scores'&&hist.edges[0]<0&&hist.edges.at(-1)>0?[0]:[]),hist.edges.at(-1)];
  for(let i=0;i<ticks.length;i++)axis.append(svgElement('text',{x:xFor(ticks[i],hist),y:56,'text-anchor':i===0?'start':i===ticks.length-1?'end':'middle',class:'energy-histogram-tick'},format(ticks[i])));
  if(kind==='scores')axis.append(svgElement('line',{x1:xFor(0,hist),x2:xFor(0,hist),y1:plot.top,y2:plot.bottom,class:'energy-histogram-zero'}));
  card.svg.append(bars,axis,markers);card.svg.setAttribute('aria-label',`${tr(kind==='scores'?'energyHistogramScores':'energyHistogramReference')}; ${format(hist.count)} ${tr('energyHistogramPixels')}; ${tr('energyHistogramLog')}`);card.svg.setAttribute('data-count',String(hist.count));
 }
 function renderMarkers(){
  if(!native)return;
  const ref=native.reference,score=native.scores,energy=native.metadata?.energy??{},rawParams=requested?.params??{},params=native.contextStatus&&rawParams.profile!=='manual'?{}:rawParams,draft=requested?.draft===true;
  if(native.contextStatus?.evaluable===false){for(const item of[reference,scores])item.svg.querySelector('[data-layer="markers"]')?.replaceChildren();reference.detail.textContent=tr('energyHistogramNoReference');scores.detail.textContent=document.documentElement?.lang==='fr'?'Aucun score calculé dans ce contexte.':'No score was computed in this context.';statusText();return;}
  const quantiles=[number(params.histogramLow,number(energy.quantiles?.[0],ref?.quantiles?.[0]??.1)*1000)/1000,number(params.histogramHigh,number(energy.quantiles?.[1],ref?.quantiles?.[1]??.9)*1000)/1000];
  const thresholds=[number(params.shadow,number(energy.thresholds?.[0],0)*10)/10,number(params.highlight,number(energy.thresholds?.[1],0)*10)/10];
  const nativePercentiles=ref?.quantiles??energy.quantiles??[],changed=quantiles.some((q,i)=>q!==nativePercentiles[i]);
  // Requested cuts can move immediately using the exact population's cached
  // bins. Counts and native probes remain untouched until the next native update.
  const proposal=requested?.metadata?.reference,explicit=draft&&proposal?.preview===true&&proposal.panelId===native.selection.referencePanelId&&proposal.qualityIndex===native.selection.qualityIndex&&proposal.probe,binned=Boolean(draft&&(changed||binnedGesture)&&ref?.count&&!explicit),approximate=Boolean(explicit||binned);
  // Once percentile motion begins, keep the same approximation through a return
  // to the original value. Switching between exact and binned cuts mid-gesture
  // would otherwise introduce a small backwards jump inside one bin.
  if(binned)binnedGesture=true;
  const probe=explicit?proposal.probe:binned?{...ref.probe,q10:binnedQuantile(ref,quantiles[0]),q90:binnedQuantile(ref,quantiles[1])}:ref?.probe,cuts=explicit?proposal.cuts:binned?null:ref?.cuts;
  const precision=binned?Math.max(...ref.counts.map((count,i)=>count?ref.edges[i+1]-ref.edges[i]:0)):null,precisionLabel=binned?' · '+tr('energyHistogramBinPrecision')+' '+format(precision):'';
  const refMarkers=reference.svg.querySelector('[data-layer="markers"]');
  if(refMarkers&&ref){
   refMarkers.replaceChildren();const low=cuts?.find(c=>c.kind==='low')?.value??probe?.q10,high=cuts?.find(c=>c.kind==='high')?.value??probe?.q90;
   if(Number.isFinite(low)&&Number.isFinite(high))refMarkers.append(svgElement('rect',{x:xFor(low,ref),y:plot.top,width:Math.max(0,xFor(high,ref)-xFor(low,ref)),height:plot.bottom-plot.top,class:'energy-histogram-trim','data-marker':'trim'}));
   marker(refMarkers,ref,{kind:'low',value:low,label:'qLow'+precisionLabel,draft:approximate,estimate:binned?'native-histogram-rank':undefined});marker(refMarkers,ref,{kind:'high',value:high,label:'qHigh'+precisionLabel,draft:approximate,estimate:binned?'native-histogram-rank':undefined});marker(refMarkers,ref,{kind:'mean',value:probe?.central_mean,label:tr(binned?'energyHistogramNativeMean':'energyHistogramMean'),draft:Boolean(explicit)});
  }
  const scoreMarkers=scores.svg.querySelector('[data-layer="markers"]');if(scoreMarkers){scoreMarkers.replaceChildren();marker(scoreMarkers,score,{kind:'low',value:-thresholds[0],label:tr('energyHistogramThresholds'),draft});marker(scoreMarkers,score,{kind:'high',value:thresholds[1],label:tr('energyHistogramThresholds'),draft});}
  const percentage=value=>format(value*100)+' %';
  reference.detail.textContent=ref?`Q ${ref.quality} · ${format(ref.count)} ${tr('energyHistogramPixels')} · ${tr(binned?'energyHistogramNativeMean':'energyHistogramMean')} ${format(probe?.central_mean)} · qLow/qHigh ${percentage(quantiles[0])} / ${percentage(quantiles[1])}${changed?' ('+tr('energyHistogramRequested')+')':''}${approximate?' · '+tr('energyHistogramApproximate'):changed?' · '+tr('energyHistogramNativeCuts')+' '+nativePercentiles.map(percentage).join(' / '):''}`:tr('energyHistogramNoReference');
  reference.detail.title=tr('energyHistogramReferenceRule')+(ref?.unit?' '+ref.unit:'')+precisionLabel;
  scores.detail.textContent=`${format(score.count)} ${tr('energyHistogramPixels')} · ${format(score.zeroCount)} ${tr('energyHistogramZeros')} · ${tr('energyHistogramThresholds')} ${format(-thresholds[0])} / +${format(thresholds[1])}`;scores.detail.title=tr('energyHistogramScoreRule')+(score.unit?' '+score.unit:'');
  statusText();
 }
 function options(){
  const contexts=contextList;contextText.textContent=document.documentElement?.lang==='fr'?'Contexte':'Context';contextLabel.hidden=!contexts.length;context.replaceChildren(...contexts.map((c,i)=>element('option',{value:c.id},`${document.documentElement?.lang==='fr'?'Contexte':'Context'} ${i+1} · ${c.bounds[2]-c.bounds[0]}×${c.bounds[3]-c.bounds[1]}${c.evaluable?'':document.documentElement?.lang==='fr'?' · non évaluable':' · not evaluable'}`)));context.value=selection.sourceFragment??'';
  panel.replaceChildren(...(native?.panels??[]).map(p=>element('option',{value:p.id},`${tr('energyHistogramPanel')} ${p.id} · ${p.bbox[2]-p.bbox[0]}×${p.bbox[3]-p.bbox[1]}`)));
  quality.replaceChildren(...(native?.source.qualities??[]).map((q,i)=>element('option',{value:i},String(q))));panel.value=selection.referencePanelId===null?'':String(selection.referencePanelId);quality.value=selection.qualityIndex===null?'':String(selection.qualityIndex);panel.setAttribute('aria-label',tr('energyHistogramPanel'));quality.setAttribute('aria-label','JPEG Q');controls();
 }
 function change(){if(disposed||locked||!native)return;selection={referencePanelId:Number(panel.value),qualityIndex:Number(quality.value),...(native.contexts?.length?{sourceFragment:context.value}:{})};onSelection({...selection});}
 listen(context,'change',()=>{if(disposed||locked||!contextList.length)return;selection={referencePanelId:null,qualityIndex:null,sourceFragment:context.value};onSelection({...selection});});listen(panel,'change',change);listen(quality,'change',change);controls();statusText();
 return {
  update(data){
   if(disposed)return false;
   if(data===null||data===undefined){native=null;contextList=[];requested=null;binnedGesture=false;selection={referencePanelId:null,qualityIndex:null};options();curve(reference,null,'reference');curve(scores,null,'scores');reference.detail.textContent='';scores.detail.textContent='';statusText();return true;}
   if(data.schema!==schema||data.source?.native!==true||!Array.isArray(data.source.qualities)||!Array.isArray(data.panels))throw new TypeError('Native energy-histogram/1 data required.');
   const next={contexts:data.contexts?.map(c=>({...c,bounds:[...c.bounds]})),contextStatus:data.contextStatus?{...data.contextStatus}:undefined,source:{...data.source,qualities:[...data.source.qualities]},selection:{...data.selection},panels:data.panels.map(p=>({id:p.id,bbox:[...p.bbox]})),reference:histogram(data.reference,data.reference?.available===true),scores:histogram(data.scores),metadata:{energy:{...data.metadata?.energy,quantiles:[...(data.metadata?.energy?.quantiles??[])],thresholds:[...(data.metadata?.energy?.thresholds??[])]}}};
   native=next;contextList=next.contexts??[];selection={...next.selection};requested=null;binnedGesture=false;options();curve(reference,next.reference,'reference');curve(scores,next.scores,'scores');renderMarkers();return true;
  },
  setContexts(contexts=[],selected){if(disposed)return false;if(!Array.isArray(contexts)||contexts.some(c=>typeof c.id!=='string'||!Array.isArray(c.bounds)))throw new TypeError('Exact native Energy contexts required.');contextList=contexts.map(c=>({...c,bounds:[...c.bounds]}));selection={referencePanelId:null,qualityIndex:null,sourceFragment:contextList.some(c=>c.id===selected)?selected:contextList[0]?.id??null};native=null;requested=null;options();curve(reference,null,'reference');curve(scores,null,'scores');statusText();return true;},
  markers(params={},metadata={}, {draft=false}={}){if(disposed)return false;if(!draft)binnedGesture=false;requested={params:{...params},metadata,draft:Boolean(draft)};renderMarkers();return true;},
  selected(){return {...selection};},
  lock(value=true){if(disposed)return;locked=Boolean(value);controls();statusText();},
  translate(){if(disposed)return;host.setAttribute('aria-label',tr('energyHistogramTitle'));for(const node of host.querySelectorAll('[data-histogram-label]'))node.textContent=tr(node.getAttribute('data-histogram-label'));options();if(native){curve(reference,native.reference,'reference');curve(scores,native.scores,'scores');renderMarkers();}else statusText();},
  dispose(){if(disposed)return;disposed=true;for(const remove of listeners.splice(0))remove();native=null;requested=null;host.replaceChildren();contextLabel.remove();}
 };
}

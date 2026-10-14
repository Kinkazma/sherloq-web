import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {createEnergyHistogramUI} from '../sherloq-browser/assets/energy-histogram-ui.js';
import {strings} from '../sherloq-browser/assets/i18n.js';
import {createEnergyHistogram} from '../sherloq-browser/assets/energy-histogram.js';
function environment(){
 const {document,window}=parseHTML('<html lang="en"><body><aside id="energy-histograms"></aside></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 let language='en';const changes=[],ui=createEnergyHistogramUI({root:document,document,t:key=>strings[language][key],onSelection:selection=>changes.push(selection)});
 return {document,window,ui,changes,setLanguage(value){language=value;document.documentElement.lang=value;},$:id=>document.getElementById('energy-histogram-'+id)};
}
function fixture(){return {
 schema:'sherloq.energy-histogram/1',source:{resultId:'native-1',imageId:'source-1',width:200,height:100,quality:97,qualities:[87,92,97],native:true},selection:{referencePanelId:7,qualityIndex:2},
 panels:[{id:2,bbox:[0,0,100,50],count:4000},{id:7,bbox:[0,0,200,100],count:8000}],
 reference:{available:true,native:true,panelId:7,qualityIndex:2,quality:97,edges:new Float64Array([0,1,2,3,4]),counts:new Uint32Array([9000,900,90,10]),count:10000,quantiles:[.1,.9],probe:{q10:.1,q90:2.7,central_mean:1.3},cuts:[{kind:'low',value:.1,quantile:.1},{kind:'high',value:2.7,quantile:.9}],unit:'native gray residual'},
 scores:{native:true,edges:new Float64Array([-4,-2,0,2,4]),counts:new Uint32Array([10,90,9000,900]),count:10000,zeroCount:8900,maximumMagnitude:4,observed:{minimum:-4,maximum:4},unit:'signed contrast /0.2',markers:[{kind:'low',value:-2},{kind:'high',value:3}]},
 metadata:{energy:{quantiles:[.1,.9],thresholds:[2,3]}}
};}
const values=(svg,layer)=>[...svg.querySelectorAll(`[data-layer="${layer}"] [data-count]`)].map(n=>Number(n.getAttribute('data-count')));
test('native curves retain separate residual and signed units, real counts, zero population and log visibility',()=>{
 const e=environment(),data=fixture();e.ui.update(data);
 assert.deepEqual(e.ui.selected(),{referencePanelId:7,qualityIndex:2});assert.equal(e.$('quality').value,'2');assert.equal(e.$('quality').selectedOptions?.[0]?.textContent??[...e.$('quality').options].find(o=>o.hasAttribute('selected')).textContent,'97');
 assert.deepEqual(values(e.$('reference'),'counts'),[9000,900,90,10]);assert.deepEqual(values(e.$('scores'),'counts'),[10,90,9000,900]);
 const bars=[...e.$('reference').querySelectorAll('[data-layer="counts"] rect')],big=Number(bars[0].getAttribute('height')),small=Number(bars[3].getAttribute('height'));
 assert.ok(small/big>.25,'log1p makes a low population visible beside a zero spike');assert.ok(Math.abs(big-39)<1e-9);
 assert.ok(e.$('scores-detail').textContent.includes('8,900 zeros included'));assert.ok(e.$('reference-detail').title.includes('strictly between 3 and 252'));assert.ok(e.$('scores-detail').title.includes('energy_scope > 0'));
 assert.equal(e.$('reference').querySelectorAll('[data-marker="low"]').length,1);assert.equal(e.$('reference').querySelectorAll('[data-marker="high"]').length,1);assert.equal(e.$('reference').querySelectorAll('[data-marker="mean"]').length,1);
 assert.equal(e.$('scores').querySelectorAll('[data-marker]').length,2,'score view has only the two strong thresholds');
 assert.equal(e.$('scores').querySelector('[data-marker="low"]').getAttribute('data-value'),'-2');assert.equal(e.$('scores').querySelector('[data-marker="high"]').getAttribute('data-value'),'3');e.ui.dispose();
});
test('gestures estimate residual cuts and change score thresholds without mutating native counts or probes',()=>{
 const e=environment(),data=fixture();e.ui.update(data);const counts=e.$('reference').querySelector('[data-layer="counts"]'),scoreCounts=e.$('scores').querySelector('[data-layer="counts"]');
 data.reference.counts.fill(0);data.reference.probe.q10=99;data.metadata.energy.quantiles[0]=.49;
 e.ui.markers({histogramLow:450,histogramHigh:600,shadow:70,highlight:20},{energy:{quantiles:[.45,.6],panels:[{id:7,probes:[{q10:8},{q10:9},{q10:10,q90:11,central_mean:10.5}]}]}},{draft:true});
 assert.equal(e.$('reference').querySelector('[data-layer="counts"]'),counts);assert.equal(e.$('scores').querySelector('[data-layer="counts"]'),scoreCounts);assert.deepEqual(values(e.$('reference'),'counts'),[9000,900,90,10]);
 const residualLow=e.$('reference').querySelector('[data-marker="low"]'),residualHigh=e.$('reference').querySelector('[data-marker="high"]');assert.equal(residualLow.getAttribute('data-estimate'),'native-histogram-rank');assert.ok(Number(residualLow.getAttribute('data-value'))>.1&&Number(residualLow.getAttribute('data-value'))<1);assert.ok(Number(residualHigh.getAttribute('data-value'))<1);assert.equal(residualLow.classList.contains('draft'),true);assert.equal(e.$('reference').querySelector('[data-marker="mean"]').getAttribute('data-value'),'1.3');assert.equal(e.$('reference').querySelector('[data-marker="mean"]').classList.contains('draft'),false);
 assert.ok(e.$('reference-detail').textContent.includes('45 % / 60 %'));assert.ok(e.$('reference-detail').textContent.includes('approximate preview cutoffs'));assert.ok(e.$('reference-detail').textContent.includes('native trimmed mean'));assert.ok(e.$('status').textContent.includes('native curves retained'));
 const low=e.$('scores').querySelector('[data-marker="low"]');assert.equal(low.getAttribute('data-value'),'-7');assert.equal(low.getAttribute('data-clipped'),'true');assert.equal(low.getAttribute('x1'),'8');assert.ok(low.textContent.includes('outside the plotted range'));assert.ok(low.classList.contains('draft'));assert.equal(e.$('scores').querySelector('[data-marker="high"]').getAttribute('data-value'),'2');e.ui.dispose();
});
test('binned percentile cuts move monotonically through held gestures, preserve counts and restore exact cutoffs at release',()=>{
 const e=environment(),data=fixture();e.ui.update(data);const counts=e.$('reference').querySelector('[data-layer="counts"]'),nativeBytes=new Uint8Array(data.reference.counts.buffer).slice(),lows=[],highs=[];
 for(let low=0;low<=500;low+=50){e.ui.markers({histogramLow:low,histogramHigh:1000-low},{},{draft:true});lows.push(Number(e.$('reference').querySelector('[data-marker="low"]').getAttribute('data-value')));highs.push(Number(e.$('reference').querySelector('[data-marker="high"]').getAttribute('data-value')));assert.equal(e.$('reference').querySelector('[data-layer="counts"]'),counts);}
 assert.ok(lows.every((value,i)=>!i||value>=lows[i-1]));assert.ok(highs.every((value,i)=>!i||value<=highs[i-1]));assert.ok(lows.at(-1)>lows[0]);assert.ok(highs.at(-1)<highs[0]);assert.deepEqual(new Uint8Array(data.reference.counts.buffer),nativeBytes);assert.equal(data.reference.probe.q10,.1);assert.equal(data.reference.probe.q90,2.7);
 e.ui.update(data);assert.equal(e.$('reference').querySelector('[data-marker="low"]').getAttribute('data-value'),'0.1');assert.equal(e.$('reference').querySelector('[data-marker="high"]').getAttribute('data-value'),'2.7');assert.equal(e.$('reference').querySelector('[data-marker="low"]').hasAttribute('data-estimate'),false);assert.equal(e.$('reference').querySelector('[data-marker="low"]').classList.contains('draft'),false);e.ui.dispose();
});
test('rank interpolation spans sparse distributions, bounds endpoints and qualifies bin precision',()=>{
 const e=environment(),data=fixture();Object.assign(data.reference,{edges:new Float64Array([0,1,100,101]),counts:new Uint32Array([1,0,1]),count:2,observed:{minimum:.25,maximum:100.25},probe:{q10:.25,q90:100.25,central_mean:50.25},cuts:[{kind:'low',value:.25},{kind:'high',value:100.25}]});e.ui.update(data);
 e.ui.markers({histogramLow:500,histogramHigh:500},{},{draft:true});const median=Number(e.$('reference').querySelector('[data-marker="low"]').getAttribute('data-value'));assert.ok(Math.abs(median-50.25)<=1,'order-statistic interpolation keeps error within occupied bin width across an empty gap');assert.ok(e.$('reference-detail').title.includes('uncertainty ≤ 1'));
 e.ui.markers({histogramLow:0,histogramHigh:1000},{},{draft:true});assert.equal(e.$('reference').querySelector('[data-marker="low"]').getAttribute('data-value'),'0.25');assert.equal(e.$('reference').querySelector('[data-marker="high"]').getAttribute('data-value'),'100.25');assert.ok(e.$('reference-detail').textContent.includes('approximate'));assert.deepEqual(values(e.$('reference'),'counts'),[1,1]);e.ui.dispose();
});
test('only explicitly provisional matching panel and quality probes can draw approximate residual cutoffs',()=>{
 const e=environment();e.ui.update(fixture());const proposed={reference:{preview:true,panelId:7,qualityIndex:2,probe:{q10:.4,q90:2,central_mean:1.1}}};
 e.ui.markers({histogramLow:200,histogramHigh:800},proposed,{draft:true});assert.equal(e.$('reference').querySelector('[data-marker="low"]').getAttribute('data-value'),'0.4');assert.ok(e.$('reference').querySelector('[data-marker="low"]').classList.contains('draft'));assert.ok(e.$('reference-detail').textContent.includes('approximate preview cutoffs'));assert.deepEqual(values(e.$('reference'),'counts'),[9000,900,90,10]);
 e.ui.markers({}, {...proposed,reference:{...proposed.reference,qualityIndex:0}}, {draft:true});assert.equal(e.$('reference').querySelector('[data-marker="low"]').getAttribute('data-value'),'0.1');
 e.ui.markers({}, proposed, {draft:false});assert.equal(e.$('reference').querySelector('[data-marker="low"]').getAttribute('data-value'),'0.1');e.ui.dispose();
});
test('selector callbacks, lock and native update preserve explicit panel/quality without assuming index1 is baseQ',()=>{
 const e=environment();e.ui.update(fixture());e.$('panel').value='2';e.$('quality').value='0';e.$('panel').dispatchEvent(new e.window.Event('change'));
 assert.deepEqual(e.changes,[{referencePanelId:2,qualityIndex:0}]);assert.deepEqual(e.ui.selected(),{referencePanelId:2,qualityIndex:0});const returned=e.ui.selected();returned.referencePanelId=99;assert.equal(e.ui.selected().referencePanelId,2);
 e.ui.lock();assert.equal(e.$('panel').disabled,true);assert.equal(e.$('quality').disabled,true);assert.equal(e.document.getElementById('energy-histograms').getAttribute('aria-busy'),'true');e.$('quality').dispatchEvent(new e.window.Event('change'));assert.equal(e.changes.length,1);
 const next=fixture();next.selection={referencePanelId:2,qualityIndex:0};Object.assign(next.reference,{panelId:2,qualityIndex:0,quality:87});e.ui.update(next);e.ui.lock(false);assert.equal(e.$('quality').value,'0');assert.equal(e.$('panel').disabled,false);assert.ok(e.$('reference-detail').textContent.startsWith('Q 87'));e.ui.dispose();
});
test('scoped document facades create SVG in the real owner document and keep independent panel state',()=>{
 const {document}=parseHTML('<html><body></body></html>'),owners=[];
 for(let i=0;i<2;i++){const host=document.createElement('div');document.body.append(host);const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<aside id="energy-histograms"></aside>';const scoped={getElementById:id=>shadow.getElementById(id),createElement:tag=>document.createElement(tag),documentElement:host};const ui=createEnergyHistogramUI({root:scoped,document:scoped});ui.update(fixture());owners.push({ui,shadow});}
 owners[0].ui.lock();owners[0].ui.markers({histogramLow:400,histogramHigh:600},{},{draft:true});assert.ok(owners[0].shadow.getElementById('energy-histogram-status').textContent.includes('Provisional'));assert.equal(owners[1].shadow.getElementById('energy-histogram-status').textContent,'Native curves');assert.equal(owners[1].shadow.getElementById('energy-histogram-panel').disabled,false);assert.equal(owners[0].shadow.getElementById('energy-histogram-reference').ownerDocument,document);
 owners[0].ui.dispose();assert.equal(owners[1].shadow.querySelectorAll('[data-layer="counts"] rect').length,8);owners[1].ui.dispose();
});
test('all-zero scores stay visible and native; unavailable reference and clearing cannot leave stale axes',()=>{
 const e=environment(),data=fixture();data.reference={available:false,count:0};data.panels=[];data.selection.referencePanelId=null;data.scores.edges=new Float64Array([-.5,0,.5]);data.scores.counts=new Uint32Array([0,10000]);data.scores.zeroCount=10000;data.scores.maximumMagnitude=0;data.scores.observed={minimum:0,maximum:0};e.ui.update(data);
 const bars=e.$('scores').querySelectorAll('[data-layer="counts"] rect');assert.equal(bars.length,1);assert.ok(bars[0].classList.contains('neutral'));assert.equal(Number(bars[0].getAttribute('height')),39);assert.ok(e.$('reference-detail').textContent.includes('No reference panel'));assert.equal(e.$('panel').disabled,true);assert.ok(e.$('scores-detail').textContent.includes('10,000 zeros included'));
 e.ui.update(null);assert.equal(e.$('scores').children.length,0);assert.equal(e.$('scores').hasAttribute('data-count'),false);assert.equal(e.$('quality').disabled,true);assert.deepEqual(e.ui.selected(),{referencePanelId:null,qualityIndex:null});e.ui.dispose();
});
test('invalid or draft input is rejected atomically; disposal removes listeners and ignores late delivery',()=>{
 const e=environment();e.ui.update(fixture());const before=e.$('reference').toString(),bad=fixture();bad.source.native=false;assert.throws(()=>e.ui.update(bad),/Native/);assert.equal(e.$('reference').toString(),before);
 bad.source.native=true;bad.scores.counts[0]++;assert.throws(()=>e.ui.update(bad),/Invalid native histogram/);assert.equal(e.$('reference').toString(),before);
 const select=e.$('panel');e.ui.dispose();select.dispatchEvent(new e.window.Event('change'));assert.equal(e.changes.length,0);assert.equal(e.ui.update(fixture()),false);assert.equal(e.ui.markers({}, {}, {draft:true}),false);assert.equal(e.document.getElementById('energy-histograms').children.length,0);
});
test('language changes preserve selection and provisional marker intent',()=>{
 const e=environment();e.ui.update(fixture());e.ui.markers({shadow:10,highlight:20},{},{draft:true});const selected=e.ui.selected();e.setLanguage('fr');e.ui.translate();assert.deepEqual(e.ui.selected(),selected);assert.equal(e.$('scores').querySelector('[data-marker="low"]').getAttribute('data-value'),'-1');assert.ok(e.$('status').textContent.includes('Réglages provisoires'));assert.ok(e.$('reference-detail').textContent.includes('moyenne tronquée'));
 for(const key of ['energyHistogramReference','energyHistogramScores','energyHistogramLog','energyHistogramDraft'])assert.ok(strings.fr[key]&&strings.en[key]);e.ui.dispose();
});
test('bounded native helper feeds actual 256-bin counts; marker gestures never read image rows or rerun science',async()=>{
 const e=environment(),width=4,height=2,n=width*height,planes=Float32Array.from({length:3*n},(_,i)=>i%8+Math.floor(i/n)*10),rgb=new Uint8Array(3*n).fill(100);rgb.fill(0,0,3);let reads=0;
 const probe=value=>({q10:value,q90:value+5,central_mean:value+2,central_variance:1,low_mean:value,low_variance:0,high_mean:value+6,high_variance:0}),panels=[{id:1,bbox:[0,0,width,height],probes:[probe(1),probe(11),probe(21)]}],analysis={id:'bounded-native',imageId:'source',operation:'ela.energy',provenance:{operation:'ela.energy',originalSha256:'a'.repeat(64)},data:{width,height,energy_planes:planes,energy_summary:panels,energy_scope:new Int32Array([0,1,1,1,1,1,1,1]),energy_low_score:new Float32Array([0,3,0,0,2,0,0,0]),energy_high_score:new Float32Array([0,0,0,4,0,0,1,0]),metadata:{method:'ela_energy',quality:2,qualities:[2,7,12],energy:{enabled:true,quantiles:[.1,.9],thresholds:[2,3],panels}}}};
 const helper=createEnergyHistogram({engine:{run(){throw Error('UI must never recompute science');}},readOriginal:async(_analysis,rect)=>{reads++;const data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++){const from=((rect.y+y)*width+rect.x)*3;data.set(rgb.subarray(from,from+rect.width*3),y*rect.width*3);}return {width:rect.width,height:rect.height,data};}});
 try{const result=await helper.get(analysis);assert.equal(result.reference.counts.length,256);e.ui.update(result);assert.deepEqual(e.ui.selected(),{referencePanelId:1,qualityIndex:0});assert.equal(values(e.$('reference'),'counts').reduce((a,b)=>a+b,0),7);assert.equal(values(e.$('scores'),'counts').reduce((a,b)=>a+b,0),7);const beforeReads=reads;
  for(let i=0;i<30;i++)e.ui.markers({histogramLow:100+i,histogramHigh:900-i,shadow:i,highlight:200-i},result.metadata,{draft:true});assert.equal(reads,beforeReads);assert.equal(e.$('reference').getAttribute('data-count'),'7');assert.equal(e.$('scores').getAttribute('data-count'),'7');
  const exact=await helper.get({...analysis,id:'native-after-release',data:{...analysis.data,metadata:{...analysis.data.metadata,energy:{...analysis.data.metadata.energy,thresholds:[2.9,17.1]}}}});e.ui.update(exact);assert.equal(e.$('scores').querySelector('[data-marker="low"]').getAttribute('data-value'),'-2.9');assert.equal(e.$('scores').querySelector('[data-marker="high"]').getAttribute('data-value'),'17.1');assert.equal(e.$('status').textContent,'Native curves');assert.equal(e.$('scores').querySelector('[data-marker="high"]').classList.contains('draft'),false);
 }finally{await helper.dispose();e.ui.dispose();}
});
test('real Biome panel has four controls beside one histogram host and a responsive embedded layout',async()=>{
 const [html,appCSS,panelCSS]=await Promise.all(['panel.html','app.css','panel.css'].map(name=>readFile(new URL('../sherloq-browser/assets/'+name,import.meta.url),'utf8'))),document=parseHTML(html).document;
 const grid=document.querySelector('#energy-biome-controls > .energy-biome-grid');assert.ok(grid);assert.equal(grid.querySelector('.energy-four').children.length,4);assert.equal(grid.querySelectorAll('#energy-histograms').length,1);assert.equal(grid.nextElementSibling.className,'preset-bar');
 assert.ok(appCSS.includes('minmax(0,320px)'));assert.ok(appCSS.includes('@container energy-biome (max-width:540px)'));assert.ok(panelCSS.includes('.energy-biome-grid .energy-four{display:grid'));assert.ok(panelCSS.includes('.energy-biome-grid .energy-pair input[type=range]{width:100%!important'));
});

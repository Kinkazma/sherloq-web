import {pcaCloudScene} from './pca-cloud-scene.js?v=0.33.3';
import {createScatterView,createPlotCamera,createPlotIntroState} from './scatter-view.js?v=0.33.3';
import {createPcaRasterView} from './pca-raster-view.js?v=0.33.3';
import {bindSliderReset} from './slider-reset.js?v=0.33.3';

export function createPcaCloudPanel({document,parent,controlsHost,data,display,getClient,createDisplaySurface,language=()=> 'fr',getNavigationMode=()=> 'auto',notify=()=>{},state={},forceCanvas=false,opening}){
 const scene=pcaCloudScene(data),node=(tag,text,props={})=>Object.assign(document.createElement(tag),{textContent:text??'',...props});
 state.alpha??=.55;state.colored??=true;state.axes??=true;state.maxPoints??=null;state.camera??=createPlotCamera();state.intro??=createPlotIntroState();
 // The retained raster already carries display orientation. Viewport changes
 // resize the panes without switching their order or losing the other split.
 const stacked=Number.isFinite(display?.width)&&Number.isFinite(display?.height)&&display.width>display.height,layout=stacked?'stacked':'side';
 state.chartPixels??={};state.autoChartPixels??={};
 const hasRaster=!!display&&!!createDisplaySurface,openingMatches=!!opening&&!!display&&opening.displayId===display.id;
 let openingPending=hasRaster&&((openingMatches&&opening.serial!==state.openingApplied)||!Number.isFinite(state.chartPixels[layout])),initialPresentation=openingPending&&openingMatches?opening.geometry:null,effectiveChartPixels=0;
 const bar=node('div',null,{className:'pca-cloud-controls'}),densityLabel=node('label'),densityCaption=node('span','Points'),density=node('select',null,{ariaLabel:'Nombre de points du nuage PCA'});
 for(const [value,text]of [['auto','Auto'],['2048','2 k'],['8192','8 k'],['32768','32 k'],['131072','128 k']])density.append(node('option',text,{value}));density.value=state.maxPoints===null?'auto':String(state.maxPoints);densityLabel.append(densityCaption,density);bar.append(densityLabel);
 const labels=[];
 for(const key of ['colored','axes']){const label=node('label'),input=node('input',null,{type:'checkbox',checked:state[key]}),caption=node('span');label.append(input,caption);labels.push([key,caption]);input.onchange=()=>{state[key]=input.checked;update();};bar.append(label);}
 const opacityLabel=node('label'),opacityCaption=node('span'),opacity=node('input',null,{type:'range',min:'0.05',max:'1',step:'0.05',value:String(state.alpha),ariaLabel:'Opacité du nuage PCA'});opacityLabel.append(opacityCaption,opacity);bar.append(opacityLabel);
 const summary=node('span',null,{className:'pca-variance'});bar.append(summary);
 const root=node('section',null,{className:'pca-cloud-panel'}),imageHost=node('div',null,{className:'pca-image-pane'}),separator=node('div',null,{className:'pca-splitter',tabIndex:0,role:'separator'}),host=node('div',null,{className:'pca-cloud-pane'});root.dataset.layout=layout;separator.setAttribute('aria-orientation',stacked?'horizontal':'vertical');root.append(...(stacked?[host,separator,imageHost]:[imageHost,separator,host]));parent.append(root);host.append(bar);
 const reset3D=node('button',null,{type:'button',className:'pca-cloud-reset'}),attachReset=()=>{host.prepend(bar);host.querySelector('.scatter-stage')?.append(reset3D);};
 const guides=[];
 const maximum=()=>state.maxPoints??Math.min(32768,Math.max(4096,Math.floor(host.clientWidth*host.clientHeight/24)));
 const style=()=>({kind:'3d',x:0,y:1,z:2,colored:state.colored,alpha:state.alpha,maxPoints:maximum()});
 let view,raster,observer,viewDisposed=false;
 function disposePanel(){observer?.disconnect();if(!viewDisposed){view?.dispose();viewDisposed=true;}bar.remove();root.remove();return raster?.dispose();}
 const constructionError=primary=>Object.assign(Error(String(primary?.message??primary),{cause:primary}),{...(primary?.code?{code:primary.code}:{}),cleanupOwner:{dispose:disposePanel}});
 function resize(){
  const bounds=root.getBoundingClientRect(),width=bounds.width,height=bounds.height,length=stacked?height:width,gap=Math.min(6,length),available=Math.max(0,length-gap);
  const tracks=pixels=>{const value=stacked?`${pixels}px ${gap}px minmax(0,1fr)`:`minmax(0,1fr) ${gap}px ${pixels}px`;root.style.gridTemplateColumns=!hasRaster||stacked?'minmax(0,1fr)':value;root.style.gridTemplateRows=hasRaster&&stacked?value:'minmax(0,1fr)';};
  if(openingPending&&width>0&&height>0&&available>0){
   const previous=initialPresentation,previousMatches=Number.isFinite(previous?.scale)&&previous.scale>0&&previous.width===display.width&&previous.height===display.height,previousScale=previousMatches?previous.scale:Math.min(width/display.width,height/display.height)*.95,imageAxis=stacked?display.height:display.width;
   // Reserve a usable cloud at activation; retain every free pixel when there
   // is already enough room. Later resizes and the human splitter stay free.
   let chartPixels=Math.max(0,available-imageAxis*previousScale);if(!view)chartPixels=Math.max(available*.3,chartPixels);
   if(view){
    const limit=Math.max(0,available-1),chromeHeight=()=>{const help=host.querySelector('.scatter-help'),margins=help&&(document.defaultView?.getComputedStyle?.(help)??globalThis.getComputedStyle?.(help));return bar.getBoundingClientRect().height+(help?.getBoundingClientRect().height??0)+(parseFloat(margins?.marginTop)||0)+(parseFloat(margins?.marginBottom)||0);};
    tracks(chartPixels);
    if(stacked)chartPixels=Math.min(limit,Math.max(chartPixels,chromeHeight()+240));
    else{
     chartPixels=Math.min(limit,Math.max(chartPixels,240,bar.scrollWidth??0));tracks(chartPixels);
     if(height-chromeHeight()<240){const currentHeight=height-chromeHeight();let lower=chartPixels,upper=limit;tracks(upper);const target=Math.min(240,height-chromeHeight());if(target>currentHeight){for(let i=0;i<8;i++){const middle=(lower+upper)/2;tracks(middle);if(height-chromeHeight()>=target)upper=middle;else lower=middle;}chartPixels=upper;}}
    }
    const scale=Math.min(previousScale,(available-chartPixels)/imageAxis);
    if(!previousMatches||scale!==previous.scale){
     const cx=previousMatches?(previous.viewportWidth/2-previous.offsetX)/previousScale:display.width/2,cy=previousMatches?(previous.viewportHeight/2-previous.offsetY)/previousScale:display.height/2;
     initialPresentation={width:display.width,height:display.height,scale,viewportWidth:width,viewportHeight:height,offsetX:width/2-(Number.isFinite(cx)?cx:display.width/2)*scale,offsetY:height/2-(Number.isFinite(cy)?cy:display.height/2)*scale};
    }
    state.autoChartPixels[layout]=chartPixels;if(openingMatches)state.openingApplied=opening.serial;openingPending=false;raster?.setInitialPresentation(initialPresentation);
   }
   state.chartPixels[layout]=chartPixels;
  }
  // Clipping never overwrites the human/activation preference. Only the image
  // track absorbs ordinary window growth on the splitter axis.
  effectiveChartPixels=hasRaster?Math.min(available,Math.max(0,state.chartPixels[layout]??0)):length;state.split=length?(stacked?effectiveChartPixels/length:1-effectiveChartPixels/length):0;
  tracks(effectiveChartPixels);separator.setAttribute('aria-valuemin','0');separator.setAttribute('aria-valuemax',String(Math.round(available)));separator.setAttribute('aria-valuenow',String(Math.round(effectiveChartPixels)));separator.setAttribute('aria-valuetext',Math.round(effectiveChartPixels)+' px');view?.setStyle(style());raster?.redraw();
 }
 // Fill every layout-bearing caption before the first geometry measurement.
 try{translate();resize();raster=hasRaster?createPcaRasterView({document,parent:imageHost,display,createDisplaySurface,getNavigationMode,notify,initialPresentation}):null;
 if(!raster)imageHost.hidden=separator.hidden=true;
 view=createScatterView({document,parent:host,points:scene.points,columns:scene.columns,style:style(),language,getNavigationMode,forceCanvas,canvasMaxPoints:32768,cameraState:state.camera,introState:state.intro,onBackendChange:()=>{attachReset();if(view)translate();},guideSegments:guides,axisLabels:scene.axisLabels,ariaLabel:'Nuage PCA 3D interactif'});
 attachReset();resize();}catch(primary){throw constructionError(primary);}reset3D.onclick=e=>{e.stopPropagation();view.reinitialize();};
 let dragging=false,dragStart=0,dragPixels=0;
 const setPixels=value=>{const length=stacked?root.clientHeight:root.clientWidth;state.chartPixels[layout]=Math.max(0,Math.min(Math.max(0,length-6),value));resize();};
 separator.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();dragging=true;dragStart=stacked?e.clientY:e.clientX;dragPixels=effectiveChartPixels;separator.setPointerCapture(e.pointerId);};
 separator.onpointermove=e=>{if(!dragging)return;setPixels(dragPixels+((stacked?e.clientY:e.clientX)-dragStart)*(stacked?1:-1));};
 separator.onpointerup=separator.onpointercancel=separator.onlostpointercapture=()=>{dragging=false;};
 separator.onkeydown=e=>{const previous=stacked?'ArrowUp':'ArrowLeft',next=stacked?'ArrowDown':'ArrowRight';if(![previous,next,'Home'].includes(e.key))return;e.preventDefault();const length=stacked?root.clientHeight:root.clientWidth;setPixels(e.key==='Home'?(state.autoChartPixels[layout]??0):effectiveChartPixels+(e.key===previous?-1:1)*(stacked?1:-1)*Math.max(1,length*.05));};
 function translate(){
  const fr=language()==='fr';separator.setAttribute('aria-label',fr?'Redimensionner image et nuage':'Resize image and point cloud');for(const [key,caption]of labels)caption.textContent=key==='colored'?(fr?'Couleurs':'Colors'):(fr?'Axes PCA':'PCA axes');
  reset3D.textContent=fr?'Réinitialiser':'Reset';reset3D.setAttribute('aria-label',fr?'Réinitialiser la vue 3D':'Reset 3D view');reset3D.title=fr?'Recentrer la vue 3D et relancer son animation':'Recenter the 3D view and restart its animation';
  opacityCaption.textContent=fr?'Opacité':'Opacity';
  summary.textContent=scene.explainedVariance.map((part,k)=>'PC'+(k+1)+' '+(100*part).toLocaleString(fr?'fr':'en',{maximumFractionDigits:1})+' %').join(' · ');
  summary.title=fr?'Variance sur tous les pixels admis. Axes ±2σ bornés au cube RGB.':'Variance from all admitted pixels. Axes ±2σ bounded by the RGB cube.';
  density.title=(fr?'Affichage seulement : ':'Display only: ')+(view?.displayCount??0).toLocaleString()+' / '+scene.points.total.toLocaleString()+(fr?' pixels. Auto adapte la densité à la taille du panneau ; la PCA conserve tous les pixels admis.':' pixels. Auto adapts density to panel size; PCA retains all admitted pixels.');view?.redraw();
 }
 function update(){guides.splice(0,guides.length,...(state.axes?scene.guideSegments:[]));view.setStyle(style());translate();}
 density.onchange=()=>{state.maxPoints=density.value==='auto'?null:Number(density.value);update();};opacity.oninput=()=>{state.alpha=Number(opacity.value);update();};bindSliderReset(opacity,.55);
 try{observer=new ResizeObserver(()=>{resize();translate();});observer.observe(root);observer.observe(host);update();}catch(primary){throw constructionError(primary);}
 return {element:root,translate,setDisplay(value,options){if(!raster||!value||(value.width>value.height)!==stacked)return false;if(!raster.setDisplay(value,options))return false;display=value;return true;},redraw(){view.redraw();raster?.redraw();},get snapshot(){return {backend:view.backend,count:view.displayCount,sampleCount:scene.points.count,total:scene.points.total,maxPoints:state.maxPoints,layout,split:state.split,preferredChartPixels:state.chartPixels[layout],chartPixels:effectiveChartPixels,imageCamera:raster?.camera,imageGeometry:raster?.geometry,camera:view.camera,vertexBytes:scene.points.values.byteLength};},dispose:disposePanel};
}

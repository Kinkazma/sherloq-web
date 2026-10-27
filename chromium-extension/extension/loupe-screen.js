// CSS geometry shared by the PDF reader and page overlays.
export function automaticLoupeSize(settings){return {...settings,diameter:300,transition:60,proportional:true};}
export function overlayLoupeSpace(view=globalThis){const visual=view.visualViewport;return {width:visual?.width||view.innerWidth,height:visual?.height||view.innerHeight,extensionViewport:true};}
export function resolveLoupeGeometry(settings,space=globalThis.screen){
 const width=Number(space?.width)||2056,height=Number(space?.height)||1329,short=Math.min(width,height);
 if(!settings.proportional)return {diameter:settings.diameter,transition:settings.transition,factor:1};
 if(space?.extensionViewport===true){
  // A useful viewport around 1080px gives about 650px. Follow larger and
  // smaller windows as well, independently of the physical screen and DPR.
  let factor=short*.6/300,diameter=settings.diameter*factor,transition=settings.transition;
  const fit=Math.min(1,short/(diameter+2*transition));
  factor*=fit;diameter*=fit;transition*=fit;
  return {diameter,transition,factor};
 }
 const factor=short/1329;
 return {diameter:settings.diameter*factor,transition:settings.transition*factor,factor};
}

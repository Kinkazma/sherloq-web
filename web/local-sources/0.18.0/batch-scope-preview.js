import {rectangleComplement,rectanglePolygon} from './batch-scope-geometry.js?v=0.18.0';

// The preview uses the exact exclusion polygons consumed by the analysis.
// Only their presentation differs: unclassified margins have no red outline.
export function appendScientificScopePreview(svg,scope,{width,height,id}){
 const document=svg.ownerDocument,ns='http://www.w3.org/2000/svg';
 const polygon=(parent,points,className,fill)=>{
  if(!Array.isArray(points)||points.length<3||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return;
  const node=document.createElementNS(ns,'polygon');node.setAttribute('points',points.map(p=>p.join(',')).join(' '));
  if(className)node.setAttribute('class',className);if(fill)node.setAttribute('fill',fill);node.setAttribute('vector-effect','non-scaling-stroke');parent.append(node);return node;
 };
 const regions=(scope.regions??[]).map(r=>r.polygon??rectanglePolygon(r)),key=JSON.stringify;
 const complement=new Set(rectangleComplement(scope.regions??[],width,height).map(key));
 const known=new Set([...(scope.text?.polygons??[]),...(scope.pdfText?.polygons??[]),...(scope.panels?.panels??[]).filter(p=>['Graphs','Flow Cytometry'].includes(p.label)).map(p=>rectanglePolygon({x0:p.rectangle[0],y0:p.rectangle[1],x1:p.rectangle[2],y1:p.rectangle[3]}))].map(key));
 const excluded=scope.excluded??[],remainder=excluded.filter(p=>complement.has(key(p))&&!known.has(key(p))),negative=excluded.filter(p=>!remainder.includes(p));
 const maskId='batch-admitted-'+String(id).replace(/[^a-zA-Z0-9_-]/g,'_'),defs=document.createElementNS(ns,'defs'),mask=document.createElementNS(ns,'mask');
 mask.id=maskId;mask.setAttribute('maskUnits','userSpaceOnUse');mask.setAttribute('x','0');mask.setAttribute('y','0');mask.setAttribute('width',width);mask.setAttribute('height',height);mask.setAttribute('mask-type','luminance');
 polygon(mask,rectanglePolygon({x0:0,y0:0,x1:width,y1:height}),null,'white');for(const p of excluded)polygon(mask,p,null,'black');defs.append(mask);svg.append(defs);
 for(const p of remainder)polygon(svg,p,'batch-scope-remainder-zone');
 const acquisition=document.createElementNS(ns,'g');acquisition.setAttribute('mask','url(#'+maskId+')');svg.append(acquisition);
 for(const p of regions)polygon(acquisition,p,scope.status==='ready'?'batch-acquisition-zone':'batch-pending-acquisition-zone');
 for(const p of negative)polygon(svg,p,scope.status==='ready'?'batch-exclusion-zone':'batch-pending-exclusion-zone');
 if(scope.annotations?.policy?.outsideAcquisitionsOnly&&scope.annotations.policy.changesAdmission===false)for(const p of scope.annotations.polygons??[])polygon(svg,p,'batch-exclusion-zone batch-annotation-zone');
 // Draw only the acquisition boundary last. Its fill remains masked above,
 // so genuine text exclusions inside a panel can never turn green.
 for(const p of regions)polygon(svg,p,scope.status==='ready'?'batch-acquisition-outline':'batch-pending-acquisition-outline');
 return {remainder:remainder.length,excluded:negative.length,acquisitions:regions.length};
}

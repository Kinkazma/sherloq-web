import {rectangleComplement,rectanglePolygon,clipPolygon} from './batch-scope-geometry.js?v=0.30.0';
// Scientific OCR masks reject native candidates/correspondences. They do not
// certify that surrounding RGB context is absent from a descriptor or model.
// Only this explicitly identified native mask is separated from hard RGB
// selection; unclassified exclusions and human geometry remain strict.
function rotation(points){
 const n=points.length;let a=0,b=1,k=0;
 while(a<n&&b<n&&k<n){const p=points[(a+k)%n],q=points[(b+k)%n],order=p[0]-q[0]||p[1]-q[1];if(!order){k++;continue;}if(order>0){a+=k+1;if(a===b)a++;}else{b+=k+1;if(a===b)b++;}k=0;}
 const start=Math.min(a,b);return points.slice(start).concat(points.slice(0,start));
}
function polygonKey(polygon){
 if(!Array.isArray(polygon)||polygon.length<3||polygon.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)))return null;
 const points=polygon.length>3&&polygon[0][0]===polygon.at(-1)[0]&&polygon[0][1]===polygon.at(-1)[1]?polygon.slice(0,-1):polygon;
 const forward=JSON.stringify(rotation(points)),reverse=JSON.stringify(rotation([...points].reverse()));return forward<reverse?forward:reverse;
}
/** Borrow the existing polygons without mutating scope, native masks or model
 * provenance. The captured Original ceiling is intersected separately by the
 * caller and is never filtered here, even when it contains automatic text. */
export function scientificScopeRgbExclusions(scope,{nativeTextCandidates=true}={}){
 if(!Array.isArray(scope?.excluded))throw new TypeError('Scientific scope exclusions are required for RGB selection.');
 const activeText=new Set((scope.text?.polygons??[]).map(polygonKey).filter(Boolean)),automaticText=new Set(),strict=new Set();
 for(const zone of scope.manual?.zones??[]){if(zone.kind!=='exclusion')continue;const key=polygonKey(zone.polygon);if(!key)continue;
  if(zone.role==='text'&&zone.origin==='automatic'&&activeText.has(key))automaticText.add(key);else strict.add(key);
 }
 // A scope's complement only limits candidate membership. It is derived
 // from the acquisitions, not an explicit instruction to erase the context
 // of the native cross-panel job. Recompute it; never trust an origin label.
 const manual=scope.manual,individual=scope.individual;
 const boundManual=manual?.schema==='sherloq.batch-manual-scope/1'&&manual.coordinates==='original-pixels'&&manual.sourceSha256===scope.sourceSha256&&manual.width===scope.width&&manual.height===scope.height&&Array.isArray(manual.zones);
 const boundIndividual=individual?.schema==='sherloq.individual-scientific-scope/1'&&individual.originalPixelsPreserved===true&&Array.isArray(individual.geometricRectangles);
 const classifiedBatch=scope.version==='batch-preparation-2'&&scope.coverage?.acquisitions==='detected-panels'&&Array.isArray(scope.panels?.panels);
 // Unknown imported geometry is not evidence that an exclusion was generated.
 // Recognized constructors retain their explicit negatives separately.
 const attributedComplement=boundManual||boundIndividual||classifiedBatch;
 for(const rectangle of individual?.geometricRectangles??[])if(rectangle.kind==='exclusion'){const key=polygonKey(rectangle.polygon??rectanglePolygon(rectangle));if(key)strict.add(key);}
 const derivedComplement=new Set();
 if(attributedComplement&&scope.schema==='sherloq.scientific-scope/1'&&scope.remainder==='excluded-unclassified'&&Array.isArray(scope.regions)&&scope.regions.length&&Number.isSafeInteger(scope.width)&&scope.width>0&&Number.isSafeInteger(scope.height)&&scope.height>0){
  for(const polygon of rectangleComplement(scope.regions,scope.width,scope.height)){const key=polygonKey(polygon);if(key)derivedComplement.add(key);}
 }
 for(const polygon of scope.pdfText?.polygons??[]){const key=polygonKey(polygon);if(key)strict.add(key);}
 for(const panel of scope.panels?.panels??[])if(panel.policyHint==='non-acquisition'||['Graphs','Flow Cytometry'].includes(panel.label)){
  const rectangle=panel.rectangle;if(Array.isArray(rectangle)&&rectangle.length===4&&rectangle.every(Number.isFinite)){const key=polygonKey(clipPolygon(rectanglePolygon({x0:rectangle[0],y0:rectangle[1],x1:rectangle[2],y1:rectangle[3]}),scope.width,scope.height));if(key)strict.add(key);}
 }
 const excluded=[],scientificOnly=[],complementOnly=[];
 for(const polygon of scope.excluded){const key=polygonKey(polygon);if(!key||strict.has(key)){excluded.push(polygon);continue;}if(derivedComplement.has(key)){scientificOnly.push(polygon);complementOnly.push(polygon);}else if(nativeTextCandidates&&automaticText.has(key))scientificOnly.push(polygon);else excluded.push(polygon);}
 return {excluded,scientificOnly,complementOnly,policy:nativeTextCandidates?'verified-acquisition-complement-and-native-ocr-candidates-with-rgb-context; explicit-human-pdf-graph-and-unclassified-exclusions-hard':'verified-acquisition-complement-context-only; all-explicit-ocr-human-pdf-graph-and-unclassified-exclusions-hard'};
}

/** Counts from the presentation selector, never inferred from native detections. */
export function sparseTraceSummary(output,language='fr'){
 if(!['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(output?.operation))return null;
 const counts=output.data?.metadata?.presentation?.traceSelection;
 if(!counts||counts.nativeRowsUnchanged!==true||counts.exactMaximum!==false)return null;
 const {eligiblePairs,drawnPairs}=counts;
 if(!Number.isSafeInteger(eligiblePairs)||!Number.isSafeInteger(drawnPairs)||drawnPairs<0||drawnPairs>eligiblePairs)return null;
 const fr=language==='fr',format=n=>n.toLocaleString(fr?'fr-FR':'en-US');
 return {label:fr?'Tracés':'Traces',text:fr?
  `${format(drawnPairs)} / ${format(eligiblePairs)} correspondances affichées · détections et biomes conservés`:
  `${format(drawnPairs)} / ${format(eligiblePairs)} matches shown · detections and biomes preserved`};
}

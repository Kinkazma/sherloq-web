// A native prerequisite failure is not a learned negative observation.
export function nativeSupportNotice(output,language='fr'){
 if(!['insufficient-support','partial'].includes(output?.status))return null;
 const candidates=output.notice?.code==='NATIVE_SUPPORT_INSUFFICIENT'?output.notice.windows??[]:[];
 const supports=candidates.length?candidates:[output.data?.metadata?.nativeSupport].filter(Boolean);
 const valid=supports.filter(s=>s.calculationPerformed===false&&s.negativeModelObservation===false&&Number.isSafeInteger(s.requiredCandidates)&&Number.isSafeInteger(s.availableCandidates)&&s.availableCandidates>=0&&s.availableCandidates<s.requiredCandidates);
 if(!valid.length)return null;
 const populations=valid.slice(0,3).map(s=>s.availableCandidates+'/'+s.requiredCandidates).join(', ')+(valid.length>3?'…':''),fr=language==='fr';
 if(output.status==='partial')return fr?'Résultats partiels · support insuffisant ('+populations+' candidats) : aucun calcul pour ces zones.':'Partial results · insufficient support ('+populations+' candidates): no calculation for these regions.';
 return fr?'Support insuffisant ('+populations+' candidats) — aucun calcul.':'Insufficient support ('+populations+' candidates) — no calculation.';
}

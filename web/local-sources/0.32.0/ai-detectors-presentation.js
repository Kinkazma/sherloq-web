const methods=Object.freeze({dda:'DDA',prl:'PRL','community-forensics':'Community Forensics 384',gapl:'GAPL'});

// Read the native result without changing scientific values or interpreting a
// rounded percentage. The owned boolean decision is authoritative, including
// exactly at the threshold: DDA/PRL use >= while CF/GAPL use >.
export function aiDetectorReading(output,{language='fr'}={}){
 const fr=language!=='en',data=output?.data;
 if(output?.operation!=='ai.generation.detect'||output.status!=='ok'||!methods[data?.method])return null;
 const available=Number.isFinite(data.score)&&data.score>=0&&data.score<=1&&Number.isFinite(data.threshold)&&data.threshold>=0&&data.threshold<=1&&typeof data.decision==='boolean';
 return{method:data.method,model:methods[data.method],available,value:available?data.score:null,
  logit:data.logit,threshold:data.threshold,decisionOperator:data.decisionOperator,decision:data.decision,
  direction:!available?'unavailable':data.decision?'ai':'real',
  semantics:fr?'Cet indice n’est pas une probabilité calibrée. Le classement ne prouve ni l’authenticité de l’image ni la vérité de ce qu’elle représente.':'This index is not a calibrated probability. The classification proves neither image authenticity nor the truth of what it depicts.'};
}

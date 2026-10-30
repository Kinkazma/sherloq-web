/** Presentation of already calculated native PRNU correlations only. */
export function createPrnuSummaryPanel(document,data,{language='fr'}={}){
 if(!data||!Array.isArray(data.scores))throw new TypeError('Native PRNU scores are required.');
 const fr=language==='fr',element=document.createElement('section'),text=(tag,value,parent=element)=>{const node=document.createElement(tag);node.textContent=value;parent.append(node);return node;},count=value=>Number.isSafeInteger(value)&&value>=0;
 element.className='prnu-summary';text('h3',fr?'Corrélations PRNU':'PRNU correlations');
 if(data.scores.length){
  const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr'),body=document.createElement('tbody');table.className='prnu-scores';
  for(const value of fr?['Rang','Capteur','Corrélation NCC']:['Rank','Sensor','NCC correlation'])text('th',value,header).scope='col';
  head.append(header);table.append(head,body);for(const score of data.scores){const row=document.createElement('tr');text('td',Number.isInteger(score.rank)&&score.rank>0?String(score.rank):'—',row);text('td',String(score.camera??'—'),row);const finite=typeof score.score==='number'&&Number.isFinite(score.score),cell=text('td',finite?(typeof score.scoreText==='string'&&score.scoreText?score.scoreText:String(score.score)):'—',row);if(finite)cell.title=String(score.score);body.append(row);}element.append(table);
 }else text('p',fr?'Aucune corrélation n’a été calculée.':'No correlation was calculated.');
 const threshold=typeof data.threshold==='number'&&Number.isFinite(data.threshold)?String(data.threshold):null;
 text('p',threshold===null?(fr?'Aucun seuil appliqué à ce résultat.':'No threshold was applied to this result.'):(fr?'Seuil historique expérimental, non calibré : ':'Uncalibrated historical experimental threshold: ')+threshold+'.');
 text('p',fr?'Le capteur le mieux corrélé ne constitue pas une identification certaine ni un verdict d’authenticité.':'The most correlated sensor is not a certain identification or an authenticity verdict.');
 const contexts=Array.isArray(data.nativeContexts)?data.nativeContexts:null;
 if(count(data.residualObservationCount)&&count(data.selectedOriginalPixels)){
  text('p',(fr?'Observations résiduelles : ':'Residual observations: ')+data.residualObservationCount+' / '+data.selectedOriginalPixels+(fr?' pixels sélectionnés.':' selected pixels.'));
  if(count(data.nativeSupportOmittedPixels)&&data.nativeSupportOmittedPixels>0)text('p',String(data.nativeSupportOmittedPixels)+(fr?' pixels sélectionnés sans support résiduel natif ; ils ne participent pas à la corrélation.':' selected pixels lack native residual support; they do not participate in the correlation.'));
 }
 if(contexts){
  const evaluated=contexts.filter(c=>c.evaluable===true).length,details=document.createElement('details');details.className='prnu-contexts';text('summary',(fr?'Contextes natifs : ':'Native contexts: ')+evaluated+' / '+contexts.length+(fr?' évaluables':' evaluable'),details);
  const table=document.createElement('table'),head=document.createElement('thead'),header=document.createElement('tr'),body=document.createElement('tbody');for(const value of fr?['Contexte','Bornes dans l’original','Observations','État']:['Context','Original bounds','Observations','Status'])text('th',value,header).scope='col';head.append(header);table.append(head,body);
  for(const [index,context]of contexts.entries()){const row=document.createElement('tr');text('td',String(index+1),row);text('td',Array.isArray(context.bounds)?context.bounds.join(', '):'—',row);text('td',count(context.residualPixels)?String(context.residualPixels):'—',row);const label=context.evaluable===true?(fr?'Résidu natif':'Native residual'):context.reason==="Native Wiener residual requires at least three rows and columns; the context was not analysed."?(fr?'Non analysé : moins de trois lignes ou colonnes.':'Not analysed: fewer than three rows or columns.'):context.reason??(fr?'Non évaluable':'Not evaluable');text('td',label,row);body.append(row);}details.append(table);element.append(details);
 }
 const methods=document.createElement('details');text('summary',fr?'Méthode et limites':'Method and limitations',methods);
 if(contexts)text('p',fr?'Les contextes conservent leurs estimations de bruit natives indépendantes. Une seule NCC utilise l’ensemble des observations résiduelles admises aux mêmes coordonnées de capteur ; les corrélations par contexte ne sont pas moyennées.':'Contexts retain independent native noise estimates. One NCC uses all admitted residual observations at the same sensor coordinates; context correlations are not averaged.',methods);
 if(data.residualMethod)text('p',String(data.residualMethod),methods);
 if(data.legacy===true)text('p',fr?'Base issue du format historique.':'Database from the historical format.',methods);
 if(data.trainingMembershipVerified===false)text('p',fr?'L’absence de l’image examinée dans les images d’apprentissage n’est pas vérifiée.':'The absence of the query image from the training images is not verified.',methods);
 if(typeof data.semantics==='string'&&data.semantics)text('p',data.semantics,methods);element.append(methods);
 return{element};
}

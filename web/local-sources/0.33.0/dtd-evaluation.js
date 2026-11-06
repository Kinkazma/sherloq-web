// Presentation data only; never used as detector inputs or current-image scores.
// Local counts: examples/results/dtd-documents/evaluation.json (five matched pairs).
const synthetic=Object.freeze([0.3650320465046952,0.0003078710582465271,0.7526121696373694,0.9980678558349609]);
// Qu et al., CVPR 2023, Table 4, DTD row: original DocTamper benchmarks.
export const DTD_STUDY=Object.freeze({
 url:'https://openaccess.thecvf.com/content/CVPR2023/papers/Qu_Towards_Robust_Tampered_Text_Detection_in_Document_Image_New_Dataset_CVPR_2023_paper.pdf',
 rows:Object.freeze([
  Object.freeze({dataset:'DocTamper — Test',precision:0.814,recall:0.771}),
  Object.freeze({dataset:'DocTamper-FCD',precision:0.849,recall:0.786}),
  Object.freeze({dataset:'DocTamper-SCD',precision:0.745,recall:0.762})
 ])
});
export function dtdWarningText(language='fr'){
 return language!=='en'?'⚠️ EXPÉRIMENTAL — DTD peut signaler un texte intact ou manquer une retouche. Son résultat est indicatif et ne constitue pas une preuve.':'⚠️ EXPERIMENTAL — DTD can flag unchanged text or miss an edit. Its result is indicative and does not constitute proof.';
}
export function fillDTDEvaluation(document,popup,language='fr'){
 const fr=language!=='en',node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
 const percent=(value,digits=2)=>new Intl.NumberFormat(fr?'fr':'en',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value*100)+' %';
 const table=(headers,rows)=>{const el=node('table'),head=node('thead'),hr=node('tr'),body=node('tbody');for(const text of headers){const cell=node('th',text);cell.scope='col';hr.append(cell);}head.append(hr);for(const row of rows){const tr=node('tr');row.forEach((text,i)=>{const cell=node(i?'td':'th',text);if(!i)cell.scope='row';tr.append(cell);});body.append(tr);}el.append(head,body);return el;};
 const localLabels=fr?['Pixels retouchés retrouvés','Pixels intacts signalés à tort','Pixels signalés à juste titre','Décisions correctes, tous pixels confondus']:['Edited pixels found','Unedited pixels wrongly flagged','Flagged pixels that were truly edited','Correct decisions across all pixels'];
 const title=node('h3',fr?'DTD — résultats et limites':'DTD — results and limits'),localTitle=node('h4',fr?'Nos documents synthétiques':'Our synthetic documents');
 const localTable=table([fr?'Mesure':'Measure',fr?'Résultat':'Result'],localLabels.map((label,i)=>[label,percent(synthetic[i],i===1?4:2)]));
 const localNote=node('p',fr?'10 images, 5 paires avant/après, seuil 0,5. Toujours répondre « intact » donnerait déjà 99,74 % : ce n’est pas une fiabilité générale.':'10 images, 5 before/after pairs, threshold 0.5. Always answering “unedited” would already give 99.74%: this is not general reliability.');
 const studyTitle=node('h4',fr?'Étude d’origine — DocTamper':'Original study — DocTamper'),studyTable=table([fr?'Jeu d’essai':'Test set',fr?'Pixels retouchés retrouvés (R)':'Edited pixels found (R)',fr?'Pixels signalés à juste titre (P)':'Correctly flagged pixels (P)'],DTD_STUDY.rows.map(row=>[row.dataset,percent(row.recall,1),percent(row.precision,1)]));
 const source=node('p',fr?'Qu et al., CVPR 2023, tableau 4. Résultats publiés sur d’autres documents et selon leur protocole ; ce ne sont pas des mesures de cette version Web.':'Qu et al., CVPR 2023, Table 4. Published results on other documents under their protocol; these are not measurements of this Web version.');
 source.className='dtd-evaluation-source';source.dataset.source=DTD_STUDY.url;
 popup.replaceChildren(title,localTitle,localTable,localNote,studyTitle,studyTable,source);
}

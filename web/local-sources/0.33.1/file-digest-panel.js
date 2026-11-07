const digestPanelValues=new WeakMap();
/** Presentation of the existing, owned digest result. No analysis or rounding. */
export function createFileDigestPanel(document,data={}, {language='fr'}={}){
 const fr=language!=='en',el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);return node;},root=el('section');root.className='file-digest-panel';
 const count=Number.isSafeInteger(data.bytes)?new Intl.NumberFormat(fr?'fr':'en').format(data.bytes):'—',name=data.physicalFile?.name;
 root.append(el('p',(fr?'Fichier original':'Original file')+(name?' · '+name:'')+' · '+count+(fr?' octets':' bytes')));
 function table(rows,{codes=false}={}){const t=el('table'),body=el('tbody');for(const [key,value]of rows){const tr=el('tr'),th=el('th',key),td=el('td');th.scope='row';const text=value===null||value===undefined?'—':Array.isArray(value)||ArrayBuffer.isView(value)?Array.from(value).join(' · '):String(value);td.append(el(codes?'code':'span',text));tr.append(th,td);body.append(tr);}t.append(body);return t;}
 root.append(el('h3',fr?'Empreintes du fichier':'File digests'),table(Object.entries(data.hashes??{}),{codes:true}));
 const perceptual=Object.entries(data.imageHashes??{});
 if(perceptual.length)root.append(el('h3',fr?'Empreintes perceptuelles':'Perceptual hashes'),table(perceptual,{codes:true}));
 else{const notRequested=String(data.imageHashStatus??'').startsWith('Not requested');root.append(el('p',notRequested?(fr?'Empreintes perceptuelles non demandées.':'Perceptual hashes not requested.'):(fr?'Aucune empreinte perceptuelle disponible pour cette source.':'No perceptual hashes are available for this source.')));}
 const file=data.physicalFile;
 if(file){const info=el('details'),summary=el('summary',fr?'Informations sur le fichier':'File information');
  const names={name:fr?'Nom':'Name',sizeBytes:fr?'Taille (octets)':'Size (bytes)',declaredMimeType:fr?'Type déclaré':'Declared type',signatureMimeType:fr?'Type détecté':'Detected type',lastModified:fr?'Dernière modification (timestamp)':'Last modified (timestamp)',metadataOrigin:fr?'Origine des propriétés':'Property origin',nameBallistics:fr?'Indice du nom de fichier':'Filename hint',unavailable:fr?'Propriétés indisponibles':'Unavailable properties'};
  info.append(summary,table(Object.entries(file).map(([key,value])=>[names[key]??key,value])));root.append(info);
 }
 root.append(el('p',fr?'Les empreintes portent sur le fichier original complet. Les empreintes perceptuelles utilisent ses pixels décodés.':'Digests cover the complete original file. Perceptual hashes use its decoded pixels.'));
 digestPanelValues.set(root,data);
 return root;
}

/** Relabel a retained presentation without owning or recomputing an analysis. */
export function translateFileDigestPanel(panel,{language='fr'}={}){
 const data=digestPanelValues.get(panel);if(!data)return panel;
 const next=createFileDigestPanel(panel.ownerDocument,data,{language}),opened=panel.querySelector('details')?.open;
 if(opened&&next.querySelector('details'))next.querySelector('details').open=true;
 panel.replaceWith(next);return next;
}

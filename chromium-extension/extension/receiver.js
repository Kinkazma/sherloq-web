(() => {
 if(globalThis.__sherloqReceiver)return;globalThis.__sherloqReceiver=true;let active=null;
 const send=async message=>{const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw Error(response?.error||'Transfert interrompu.');return response.value;};
 function waitFor(check,message){return new Promise((resolve,reject)=>{
  const deadline=Date.now()+120_000;
  function inspect(){try{const value=check();if(value){resolve(value);return;}if(Date.now()>=deadline)throw Error(typeof message==='function'?message():message);setTimeout(inspect,50);}catch(error){reject(error);}}
  inspect();
 });}
 function documentRoots(){return [...document.querySelectorAll('.document-window')].map(view=>({view,root:view.querySelector('.panel-host')?.shadowRoot})).filter(item=>item.root);}
 function imageReady(file){
  for(const {view,root}of documentRoots()){
   if(view.classList.contains('busy')||!root.querySelector('#empty')?.hidden)continue;
   const info=root.querySelector('#file-info')?.textContent||'';
   if(!info.includes(file.name))continue;
   if(file.width&&file.height&&!info.includes(file.width+' × '+file.height))continue;
   if(document.getElementById('zoom-in')?.disabled)continue;
   return {kind:'image',fileInfo:info};
  }
  return null;
 }
 function pdfReady(file){
  for(const {view,root}of documentRoots()){
   const reader=root.querySelector('.pdf-reader');if(!reader)continue;
   const label=(root.querySelector('#file-info')?.textContent||'')+' '+view.textContent;
   if(!label.includes(file.name))continue;
   const canvas=reader.querySelector('canvas'),empty=reader.querySelector('.pdf-reader-empty');
   if(canvas?.width>10&&canvas.height>10&&empty?.hidden&&reader.querySelector('#pdf-pages button'))return {kind:'pdf',firstPageReady:true};
  }
  return null;
 }
 const batchName=name=>{const value=String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,140)||'document';return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value)?'_'+value:value;};
 function batchReady(files){
  const dialog=document.getElementById('batch-dialog'),error=dialog?.querySelector('.batch-documents .batch-error');if(error)throw Error(error.textContent);
  const names=[...dialog?.querySelectorAll('.batch-documents .batch-document strong')||[]].map(node=>node.textContent),cards=[...dialog?.querySelectorAll('.batch-grid .batch-image-card img')||[]];
  for(const file of files){const at=names.indexOf(batchName(file.name));if(at<0)return null;names.splice(at,1);}
  // The importer has already decoded and hashed every card's source. Only the
  // visible thumbnails load immediately; lazy cards below the fold may wait.
  return cards.some(image=>image.complete&&image.naturalWidth>0)?{kind:'batch',documents:files.length,images:cards.length}:null;
 }
 function batchReceipt(files){
  const dialog=document.getElementById('batch-dialog'),notice=document.createElement('div'),caption=document.createElement('p'),list=document.createElement('div'),english=document.documentElement.lang?.startsWith('en'),placeholders=[...dialog.querySelectorAll('.batch-drop,.batch-documents .batch-empty')].map(node=>({node,hidden:node.hidden}));notice.dataset.sherloqBatchReceipt='true';notice.className='batch-hint';caption.setAttribute('role','status');caption.textContent=files.length+(english?(files.length===1?' image received.':' images received.')+' SHERLOQ is preparing the analysis regions…':(files.length===1?' image reçue.':' images reçues.')+' SHERLOQ prépare les zones à analyser…');
  for(const file of files){const row=document.createElement('div'),name=document.createElement('strong'),size=document.createElement('span');row.className='batch-document';name.textContent=file.name;size.textContent=file.width&&file.height?file.width+' × '+file.height:'';row.append(name,size);list.append(row);}
  const restore=()=>{for(const {node,hidden}of placeholders)node.hidden=hidden;};for(const {node}of placeholders)node.hidden=true;notice.append(caption,list);dialog.querySelector('.batch-documents').before(notice);return {finish(){restore();notice.remove();},fail(message){restore();caption.textContent=message;}};
 }
 async function receive(id,ids=[id],batch=false){
  let receipt;
  try{
   const manifest=await send({type:'import-authorize',id});
   if(!manifest?.files?.length)throw Error('Inventaire du transfert indisponible.');
   await waitFor(()=>{const input=document.getElementById('image-file');return input&&!input.disabled&&(document.documentElement.dataset.workspaceReady==='true'||!document.getElementById('workspace-app'));},'SHERLOQ n’est pas prêt à recevoir le fichier.');
   const workspace=!!document.getElementById('workspace-app');
   if(batch){const button=document.getElementById('batch-open');if(!button)throw Error('Cette version de SHERLOQ n’expose pas l’entrée du traitement par lot.');button.click();}
   const input=await waitFor(()=>batch?document.querySelector('#batch-dialog input[type=file][multiple]'):document.getElementById('image-file'),'Entrée de fichier indisponible.');
   const data=new DataTransfer(),verification=[];
   for(const selected of ids){
    const file=manifest.files.find(item=>item.id===selected);if(!file)throw Error('Fichier absent du transfert.');
    let offset=0;const chunks=[];
    do{
     const part=await send({type:'import-chunk',id:selected,offset}),bytes=Uint8Array.from(atob(part.base64),c=>c.charCodeAt(0));
     if(part.total!==file.total||part.offset!==offset||!bytes.length||offset+bytes.length>file.total)throw Error('Transfert incomplet ou incohérent.');
     chunks.push(bytes);offset+=bytes.length;
    }while(offset<file.total);
    const received=new File(chunks,file.name,{type:file.mime});if(received.size!==file.total)throw Error('La taille reçue ne correspond pas au fichier.');
    let sha256;if(globalThis.crypto?.subtle){sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await received.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');if(sha256!==file.sha256)throw Error('L’empreinte du fichier reçu ne correspond pas à la source.');}
    data.items.add(received);verification.push({id:selected,size:received.size,sha256,expectedSha256:file.sha256});
   }
   if(batch&&workspace)receipt=batchReceipt(manifest.files);
   input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));
   // A dispatched change proves delivery, not that SHERLOQ decoded the source.
   // Wait for the original image or the first painted PDF page in known workspaces.
   let readable=false;
   if(workspace){const file=manifest.files[0];await waitFor(()=>batch?batchReady(manifest.files):file.kind==='pdf'?pdfReady(file):imageReady(file),()=>batch?'Les fichiers ont été reçus, mais leur préparation n’est pas encore confirmée. '+(document.querySelector('#batch-dialog .batch-status')?.textContent||''):'Le fichier a été transmis, mais SHERLOQ n’a pas confirmé son ouverture. '+(document.getElementById('workspace-status')?.textContent||''));readable=true;receipt?.finish();}
   await send({type:'import-done',id,readable,verification});
  }catch(error){receipt?.fail(error.message);await send({type:'import-failed',id,error:error.message}).catch(()=>{});throw error;}
 }
 chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message.type==='import-start'){
   active??=receive(message.id,message.ids,message.batch).finally(()=>active=null);
   void active.then(()=>reply({ok:true}),error=>reply({ok:false,error:error.message}));return true;
  }
 });
})();

import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionLog} from '../sherloq-browser/assets/session-log.js';
import {downloadSession,runSessionExport} from '../sherloq-browser/assets/session-ui.js';

function ui({clickError}={}){
 const nodes=new Map(),anchors=[];
 const node=tag=>({tag,dataset:{},hidden:false,children:[],textContent:'',disabled:false,setAttribute(key,value){this[key]=value;},append(...items){this.children.push(...items);for(const item of items)if(item.id)nodes.set(item.id,item);},replaceChildren(...items){this.children=[];this.append(...items);},click(){if(clickError)throw clickError;}});
 const document={documentElement:{lang:'fr'},body:node('body'),getElementById:id=>nodes.get(id),createElement(tag){const item=node(tag);if(tag==='a')anchors.push(item);return item;}};
 const created=[],revoked=[],scheduled=[],events=[];
 return {document,anchors,created,revoked,scheduled,events,emit:event=>events.push(event),urlAPI:{createObjectURL(blob){created.push(blob);return 'blob:qualification';},revokeObjectURL(url){revoked.push(url);}},schedule(callback){scheduled.push(callback);}};
}

test('a failed log read has visible feedback, original cause and phase, no download, and an enabled retry',async()=>{
 const elements=ui(),button={disabled:false,textContent:'Exporter le journal'},initial=Object.assign(Error('Read transaction aborted'),{code:'SESSION_LOG_READ_FAILED',cause:new DOMException('Read aborted','AbortError')}),log={id:'session',length:902,async report(){throw initial;}};
 const outcome=await downloadSession({...elements,button,log});assert.equal(outcome.ok,false);assert.equal(outcome.error,initial);assert.equal(outcome.phase,'read-session-log');assert.equal(button.disabled,false);assert.equal(button.textContent,'Exporter le journal');assert.equal(elements.created.length,0);assert.equal(elements.anchors.length,0);
 const feedback=elements.document.getElementById('session-export-feedback');assert.equal(feedback.hidden,false);assert.equal(feedback.role,'alert');assert.match(feedback.children[0].textContent,/SESSION_LOG_READ_FAILED.*Read transaction aborted/);assert.equal(feedback.dataset.phase,'read-session-log');
 const error=elements.events.find(event=>event.kind==='session.export.error');assert.equal(error.error,initial);assert.equal(error.eventCount,902);assert.equal(error.phase,'read-session-log');
 log.report=async()=>({schema:'sherloq.session/1',session:'session',eventCount:902,events:[]});const retry=await downloadSession({...elements,button,log});assert.equal(retry.ok,true);assert.equal(feedback.hidden,true);assert.equal(elements.anchors[0].download,'SHERLOQ-session-session.json');assert.equal(elements.revoked.length,0);elements.scheduled[0]();assert.deepEqual(elements.revoked,['blob:qualification']);
});

test('a failed download dispatch releases the Blob URL immediately and reports dispatch rather than read failure',async()=>{
 const error=Error('Download dispatch refused'),elements=ui({clickError:error}),log={id:'s',length:3,async report(){return {session:'s',eventCount:3,events:[]};}};
 const outcome=await downloadSession({...elements,log});assert.equal(outcome.ok,false);assert.equal(outcome.phase,'download-dispatch');assert.equal(outcome.error,error);assert.equal(elements.created.length,1);assert.equal(elements.scheduled.length,0);assert.deepEqual(elements.revoked,['blob:qualification']);
});

test('tool diagnostic export errors stay visible in the current dialog without rewriting its raw evidence',async()=>{
 const elements=ui(),feedback={hidden:true,textContent:'',dataset:{}},button={disabled:false,textContent:'Journal complet'},raw={errors:[{code:'INVALID_INPUT',message:'Half-open rectangle'}]},before=structuredClone(raw),error=Error('Cannot serialize diagnostic report');
 const outcome=await runSessionExport(async progress=>{progress('serialize-session-log');throw error;},{...elements,button,feedback,operation:'tool-diagnostics',log:{id:'s',length:700}});
 assert.equal(outcome.ok,false);assert.equal(feedback.hidden,false);assert.match(feedback.textContent,/Cannot serialize/);assert.equal(feedback.dataset.phase,'serialize-session-log');assert.equal(button.disabled,false);assert.deepEqual(raw,before);assert.equal(elements.document.getElementById('session-export-feedback'),undefined);
});

test('a read transaction abort rejects explicitly and a subsequent export still reads all durable events',async()=>{
 const rows=new Map();let fail=true;
 const db={close(){},transaction(_store,mode){
  const batch=[],tx={objectStore(){return {
   put(row){batch.push(structuredClone(row));},
   getAll(){const request={};queueMicrotask(()=>{if(fail){tx.error=new DOMException('Read aborted','AbortError');tx.onabort?.();}else{request.result=[...rows.values()];request.onsuccess?.();}});return request;}
  };}};
  if(mode==='readwrite')queueMicrotask(()=>{for(const row of batch)rows.set(row.index,row);tx.oncomplete?.();});return tx;
 }};
 const indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess?.());return request;}},log=createSessionLog({id:'abort-fixture',indexedDB});for(let i=0;i<130;i++)log.append({level:'info',kind:'probe',number:i});
 await assert.rejects(log.report(),error=>{assert.equal(error.code,'SESSION_LOG_READ_FAILED');assert.equal(error.cause.name,'AbortError');assert.equal(error.details.completeLogRequired,true);assert.equal(error.details.eventCount,131);return true;});assert.equal(log.recent.length,100);assert.equal(rows.size,131);
 fail=false;const report=await log.report();assert.equal(report.events.length,131);assert.equal(report.events[1].number,0);assert.equal(report.events.at(-1).number,129);await log.close();
});

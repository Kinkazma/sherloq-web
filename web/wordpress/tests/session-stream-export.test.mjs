import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionLog} from '../sherloq-browser/assets/session-log.js';
import {downloadSession} from '../sherloq-browser/assets/session-ui.js';

function databaseFixture({failReadPage=0,failWriteBatch=0}={}){
 const rows=new Map(),metrics={cursorPages:0,cursorRows:[],getAll:0,writes:0};
 const db={close(){},transaction(_store,mode){
  const batch=[],tx={objectStore(){return {
   put(row){batch.push(structuredClone(row));},
   getAll(){metrics.getAll++;const request={};queueMicrotask(()=>{request.result=[...rows.values()];request.onsuccess?.();});return request;},
   openCursor(range){const request={},page=++metrics.cursorPages,values=[...rows.values()].filter(row=>row.index>=range.lower&&row.index<=range.upper).sort((a,b)=>a.index-b.index);let at=0,count=0;
    const step=()=>{if(page===failReadPage){tx.error=new DOMException('Cursor aborted','AbortError');tx.onabort?.();return;}let continued=false;request.result=at<values.length?{value:values[at],continue(){continued=true;at++;queueMicrotask(step);}}:null;if(request.result)count++;request.onsuccess?.();if(!continued){metrics.cursorRows.push(count);queueMicrotask(()=>tx.oncomplete?.());}};
    queueMicrotask(step);return request;
   }
  };}};
  if(mode==='readwrite'){const serial=++metrics.writes;queueMicrotask(()=>{if(serial===failWriteBatch){tx.error=Error('Write batch unavailable');tx.onabort?.();}else{for(const row of batch)rows.set(row.index,row);tx.oncomplete?.();}});}return tx;
 }};
 return {rows,metrics,keyRange:{bound:(lower,upper)=>({lower,upper})},indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess?.());return request;}}};
}
const collect=()=>{const chunks=[];return {chunks,async write(bytes){chunks.push(bytes);},text:()=>new TextDecoder().decode(Buffer.concat(chunks))};};
function logWith(fixture){return createSessionLog({id:'stream-fixture',clock:()=> '2026-10-12T16:00:00.000Z',environment:{uiVersion:'fixture'},...fixture});}

test('streamed full journal equals the legacy report, including cross-page failure/retry summary, without getAll or whole-log serialization',async()=>{
 const fixture=databaseFixture(),log=logWith(fixture);
 log.append({context:'worker',sequence:1,kind:'worker.request',level:'info',operation:'analysis.clones',method:'run'});
 for(let n=0;n<2100;n++)log.append({kind:'worker.progress',level:'info',context:'worker',sequence:1,progress:{phase:'automatic-state',id:'run1',state:{states:{sift:n<130?'running':n<1200?'failed':'done'},errors:n>=130&&n<1200?{sift:{code:'INVALID_INPUT',message:'Half-open source bounds'}}:{},attempts:{sift:n<1200?1:2}}},number:n});
 log.append({kind:'operation.status',level:'info',operation:'analysis.clones',message:'Analyse automatique terminée.'});const writer=collect(),result=await log.exportTo(writer);
 assert.equal(fixture.metrics.getAll,0);assert.ok(fixture.metrics.cursorPages>32);assert.ok(Math.max(...fixture.metrics.cursorRows)<=64);assert.ok(Math.max(...writer.chunks.map(chunk=>chunk.byteLength))<100000);assert.equal(result.eventCount,2103);
 const parsed=JSON.parse(writer.text()),legacy=await log.report();assert.deepEqual(parsed,legacy);assert.equal(parsed.events.length,2103);assert.equal(parsed.events[2].number,0);assert.equal(parsed.events.at(-2).number,2099);assert.equal(parsed.summary.groupFailureAttempts,1);assert.equal(parsed.summary.operations[0].state,'completed');assert.equal(parsed.summary.operations[0].automaticRuns[0].groups.sift.attempt,2);await log.close();
});

test('failed durable writes merge with surviving cursor pages in index order, retaining every event',async()=>{
 const fixture=databaseFixture({failWriteBatch:2}),log=logWith(fixture);for(let n=0;n<200;n++)log.append({level:n===50?'error':'info',kind:'probe',number:n});const writer=collect();await log.exportTo(writer);const parsed=JSON.parse(writer.text());assert.equal(parsed.eventCount,201);assert.equal(parsed.errorCount,1);assert.deepEqual(parsed.events.slice(1).map(row=>row.number),Array.from({length:200},(_,n)=>n));assert.match(parsed.storageError,/Write batch/);await log.close();
});

test('a fixed export snapshot excludes new progress emitted during disk writing and keeps it for the next export',async()=>{
 const fixture=databaseFixture(),log=logWith(fixture);for(let n=0;n<300;n++)log.append({level:'info',kind:'probe',number:n,message:'x'.repeat(600)});const writer=collect();let appended=false;const base=writer.write;writer.write=async bytes=>{await base(bytes);if(!appended){appended=true;log.append({level:'info',kind:'probe',number:300});}};
 const value=await log.exportTo(writer),parsed=JSON.parse(writer.text());assert.equal(value.eventCount,301);assert.equal(parsed.events.at(-1).number,299);assert.equal(log.length,302);const next=collect();await log.exportTo(next);assert.equal(JSON.parse(next.text()).events.at(-1).number,300);await log.close();
});

test('a cursor abort rejects the complete journal without silently substituting the 100 recent records',async()=>{
 const fixture=databaseFixture({failReadPage:2}),log=logWith(fixture);for(let n=0;n<190;n++)log.append({level:'info',kind:'probe',number:n});const writer=collect();await assert.rejects(log.exportTo(writer),error=>error.code==='SESSION_LOG_READ_FAILED'&&error.cause.name==='AbortError'&&error.details.completeLogRequired);assert.equal(log.length,191);assert.equal(log.recent.length,100);assert.equal(fixture.rows.size,191);await log.close();
});

test('an abort or missing durable event never produces a successfully closed complete JSON file',async()=>{
 const fixture=databaseFixture(),log=logWith(fixture);for(let n=0;n<170;n++)log.append({level:'info',kind:'probe',number:n});await log.flush();fixture.rows.delete(73);await assert.rejects(log.exportTo(collect()),error=>error.code==='SESSION_LOG_INCOMPLETE'&&error.details.expectedIndex===73);const controller=new AbortController();controller.abort(new DOMException('Stopped','AbortError'));await assert.rejects(log.exportTo(collect(),{signal:controller.signal}),error=>error.name==='AbortError');await log.close();
});

test('the journal action dispatches a finished local file, preserves the envelope and cleans only its temporary file after the download lease',async()=>{
 const fixture=databaseFixture(),log=logWith(fixture);for(let n=0;n<230;n++)log.append({level:'info',kind:'probe',number:n});const writer=collect(),metrics={finished:0,cleaned:0,aborted:0},scheduled=[],diagnostics=[],files=[];
 const sinkFactory=async()=>({...writer,async finish(){metrics.finished++;return {blob:new Blob(writer.chunks,{type:'application/json'}),async cleanup(){metrics.cleaned++;}};},async abort(){metrics.aborted++;}}),report={schema:'sherloq.errors/1',errors:[{code:'INVALID_INPUT',message:'Half-open zone rectangle'}]},before=structuredClone(report);
 const result=await downloadSession({log,document:null,report,download:async(blob,name)=>{assert.equal(metrics.finished,1);files.push({blob,name});},name:'diagnostic.json',sinkFactory,schedule:(task,ms)=>scheduled.push({task,ms}),emit:event=>diagnostics.push(event)});
 assert.equal(result.ok,true);assert.equal(fixture.metrics.getAll,0);assert.equal(files[0].name,'diagnostic.json');const parsed=JSON.parse(await files[0].blob.text());assert.deepEqual(parsed.errors,report.errors);assert.equal(parsed.sessionLog.events.length,231);assert.deepEqual(report,before);assert.equal(metrics.cleaned,0);assert.equal(metrics.aborted,0);assert.equal(scheduled[0].ms,60000);await scheduled[0].task();assert.equal(metrics.cleaned,1);await log.close();
});

test('a streaming read failure aborts the temporary file, emits its real phase and dispatches no partial download',async()=>{
 const fixture=databaseFixture({failReadPage:2}),log=logWith(fixture);for(let n=0;n<170;n++)log.append({level:'info',kind:'probe',number:n});let finished=0,aborted=0,downloaded=0;const events=[],writer=collect();
 const outcome=await downloadSession({log,document:null,download:async()=>downloaded++,sinkFactory:async()=>({...writer,async finish(){finished++;return {blob:new Blob()};},async abort(){aborted++;}}),emit:event=>events.push(event)});
 assert.equal(outcome.ok,false);assert.equal(outcome.phase,'read-session-log');assert.equal(outcome.error.code,'SESSION_LOG_READ_FAILED');assert.equal(downloaded,0);assert.equal(finished,0);assert.equal(aborted,1);assert.equal(events.at(-1).kind,'session.export.error');await log.close();
});

test('an empty report envelope stays valid and a refused file URL cleans its temporary file without masking the real failure',async()=>{
 const log=logWith({indexedDB:null}),writer=collect();let cleaned=0;const error=Error('Object URL refused'),events=[];
 const outcome=await downloadSession({log,report:{},document:null,sinkFactory:async()=>({...writer,async finish(){return {blob:new Blob(writer.chunks),async cleanup(){cleaned++;throw Error('Cleanup unavailable');}};},async abort(){}}),urlAPI:{createObjectURL(){throw error;},revokeObjectURL(){throw Error('No URL to revoke');}},emit:event=>events.push(event)});
 assert.equal(outcome.ok,false);assert.equal(outcome.error,error);assert.equal(outcome.phase,'download-dispatch');assert.equal(cleaned,1);assert.equal(JSON.parse(writer.text()).sessionLog.events.length,1);assert.equal(events.find(event=>event.kind==='session.export.cleanup.error').phase,'temporary-file-cleanup');await log.close();
});

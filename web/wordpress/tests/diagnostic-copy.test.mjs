import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {copyDiagnosticText,createErrorJournal,showErrorJournal} from '../sherloq-browser/assets/error-journal.js';

function environment(clipboard){
 const {document,window}=parseHTML('<html><body><main id="app"></main></body></html>');
 Object.defineProperty(document,'defaultView',{configurable:true,value:{navigator:{clipboard},HTMLTextAreaElement:window.HTMLTextAreaElement}});
 window.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};
 return {document,window};
}
test('Copy diagnostics writes the complete displayed JSON and preserves the journal',async()=>{
 let copied;const {document}=environment({writeText:async value=>{copied=value;}}),journal=createErrorJournal();
 journal.record(Object.assign(Error('Native offset rejected'),{code:'INVALID_INPUT'}),{operation:'file.hex',parameters:{offset:256,length:64}});
 const before=journal.snapshot(),dialog=showErrorJournal(document,journal),button=dialog.querySelector('[data-action="copy-diagnostics"]');
 await button.onclick();assert.equal(copied,dialog.querySelector('pre').textContent);assert.deepEqual(JSON.parse(copied),{schema:'sherloq.errors/1',errors:before});
 assert.deepEqual(journal.snapshot(),before);assert.equal(button.disabled,false);assert.equal(dialog.querySelector('[role="status"]').textContent,'Diagnostic copié.');
});
test('Clipboard fallback copies the same text and removes its temporary field',async()=>{
 const {document}=environment({writeText:async()=>{throw Error('Permission denied');}});let received;
 document.execCommand=command=>{assert.equal(command,'copy');received=document.querySelector('textarea').value;return true;};
 document.defaultView.HTMLTextAreaElement.prototype.select=function(){};
 await copyDiagnosticText(document,'{"schema":"sherloq.errors/1","errors":[]}');
 assert.equal(received,'{"schema":"sherloq.errors/1","errors":[]}');assert.equal(document.querySelector('textarea'),null);
});
test('Denied clipboard and fallback give an actionable failure without losing diagnostics',async()=>{
 const {document}=environment({writeText:async()=>{throw Error('Permission denied');}});document.execCommand=()=>false;
 document.defaultView.HTMLTextAreaElement.prototype.select=function(){};
 const journal=createErrorJournal();journal.record(Error('Source error'),{operation:'colors.plots'});const dialog=showErrorJournal(document,journal),button=dialog.querySelector('[data-action="copy-diagnostics"]');
 await button.onclick();assert.match(dialog.querySelector('[role="alert"]').textContent,/Copie impossible.*Permission denied/);assert.equal(button.disabled,false);assert.equal(journal.length,1);assert.equal(document.querySelector('textarea'),null);
});

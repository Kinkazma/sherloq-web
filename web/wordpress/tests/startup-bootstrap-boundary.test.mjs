import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readStartupLanguage} from '../sherloq-browser/assets/startup-preferences.js';
const key='sherloq.workspace.preferences',overlay='sherloq.recovery.value.'+key;
function storage(raw,recovered){const values=new Map([[key,raw],[overlay,recovered]].filter(([,v])=>v!==undefined));const writes=[];return{values,writes,getItem:k=>values.get(k)??null,setItem:(...args)=>writes.push(args),removeItem:(...args)=>writes.push(args)};}
for(const language of ['fr','en'])test('startup reads '+language+' without validating or rewriting the preference record',()=>{const s=storage(JSON.stringify({language,unknown:{preserve:true}}));assert.equal(readStartupLanguage(s),language);assert.deepEqual(s.writes,[]);assert.equal(s.values.size,1);});
test('a recovered preference overlay supplies the same active language as normal recovery',()=>{const s=storage('{broken',JSON.stringify({language:'fr'}));assert.equal(readStartupLanguage(s),'fr');assert.equal(s.values.get(key),'{broken');assert.deepEqual(s.writes,[]);});
for(const raw of ['{broken','null','42','{"language":"de"}','{"language":"fr-FR"}'])test('invalid startup hint remains untouched: '+raw,()=>{const s=storage(raw);assert.equal(readStartupLanguage(s),undefined);assert.equal(s.values.get(key),raw);assert.deepEqual(s.writes,[]);});
test('an invalid active overlay does not fall back to an inactive original',()=>{const s=storage('{"language":"fr"}','{broken');assert.equal(readStartupLanguage(s),undefined);assert.deepEqual(s.writes,[]);});
test('storage denial cannot prevent startup',()=>{assert.equal(readStartupLanguage({getItem(){throw Error('denied');}}),undefined);});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../sherloq-browser/assets');
const manifest=JSON.parse(await readFile(new URL('../../../web-assets/manifest-template.json',import.meta.url),'utf8'));
const imports=/(?:^|[;\n])\s*(?:import|export)\s+(?!\()[^;]*?\sfrom\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g;
for(const entry of ['workspace-entry.js','dependency-bootstrap.js','offline-bridge.js'])test(entry+' has no static engine graph before dependency migration',async()=>{const pending=[[entry]],seen=new Set();while(pending.length){const chain=pending.shift(),name=chain.at(-1);if(seen.has(name))continue;seen.add(name);assert(!manifest.slots.some(slot=>name.startsWith(slot+'/')),'Premature runtime import: '+chain.join(' -> '));const source=await readFile(path.join(root,name),'utf8');for(const match of source.matchAll(imports)){const ref=(match[1]||match[2]).split(/[?#]/)[0];if(ref.startsWith('.'))pending.push([...chain,path.posix.normalize(path.posix.join(path.posix.dirname(name),ref))]);}}assert(seen.has(entry));});

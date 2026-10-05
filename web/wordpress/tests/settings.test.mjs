import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validateSettings,settingsFilename,validAutomaticSettings} from '../sherloq-browser/assets/settings.js';
const bundle=()=>({schema:'sherloq.settings/1',profiles:[{id:'profile-first',name:'Premier',operation:'ela.classic',params:{...defaults}},{id:'profile-second',name:'Deuxième',operation:'ela.classic',params:{...defaults,scale:67}}],current:{...defaults,scale:67},activeProfile:'profile-second',preferences:{navigationMode:'auto',theme:'dark',language:'fr',layout:'tile',computeProfile:'aggressive',regionMode:'whole',favorite:true,showZones:true,toolsVisible:false,inspectorVisible:true}});
test('JSON round trip keeps all presets and preferences',()=>{const b=bundle();assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(b))),b);});
test('one invalid profile rejects the entire backup without changing existing settings',()=>{const existing=bundle(),before=structuredClone(existing),bad=bundle();bad.profiles[1].params.scale=101;assert.throws(()=>validateSettings(bad));assert.deepEqual(existing,before);});
test('reject incompatible files, duplicate identities, invalid references and booleans',()=>{for(const mutate of [b=>b.schema='sherloq.session/1',b=>b.profiles[1].id='profile-first',b=>b.profiles[1].name='Premier',b=>b.activeProfile='profile-missing',b=>b.preferences.favorite='true']){const b=bundle();mutate(b);assert.throws(()=>validateSettings(b));}});
test('reconstruct approved fields without importing image data or unknown properties',()=>{const b=bundle();b.image='private';b.profiles[0].payload='ignored';assert.deepEqual(validateSettings(b),bundle());});
test('recognizable portable filename',()=>assert.equal(settingsFilename(new Date('2026-09-29T16:00:00.000Z')),'SHERLOQ-reglages-2026-09-29T16-00-00-000Z.json'));

test('old backups default to automatic navigation; new device preference round-trips',()=>{const b=bundle();delete b.preferences.navigationMode;assert.equal(validateSettings(b).preferences.navigationMode,'auto');b.preferences.navigationMode='trackpad';assert.equal(validateSettings(b).preferences.navigationMode,'trackpad');b.preferences.navigationMode='invalid';assert.throws(()=>validateSettings(b));});

test('new-feature highlights default off in old backups and round-trip when set',()=>{const b=bundle();assert.equal(validateSettings(b).preferences.highlightNewFeatures??false,false);b.preferences.highlightNewFeatures=true;assert.equal(validateSettings(b).preferences.highlightNewFeatures,true);b.preferences.highlightNewFeatures='true';assert.throws(()=>validateSettings(b));});

test('automatic view, scope and thresholds survive portable settings with validated defaults',()=>{
 const b=bundle();b.automatic={...validAutomaticSettings(),scope:'whole',source:'D2PRL',opacity:35};assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(b))),b);
 assert.throws(()=>validAutomaticSettings({opacity:-1}));assert.throws(()=>validAutomaticSettings({source:'unknown'}));
});

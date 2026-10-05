import test from 'node:test';
import assert from 'node:assert/strict';
import {browserLanguage} from '../sherloq-browser/assets/language.js';
test('browser language selects regional French/English in preference order, with English fallback',()=>{
 for(const [nav,want] of [[{languages:['fr-CA','en-US']},'fr'],[{languages:['en-GB','fr']},'en'],[{languages:['de-DE','fr-FR']},'fr'],[{language:'FR_fr'},'fr'],[{languages:['es']},'en'],[{},'en']])assert.equal(browserLanguage(nav),want);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {errorText,localizeStatus} from '../sherloq-browser/assets/ui-errors.js';
test('scope errors explain no-data and unsupported paths without implying excluded pixels were computed',()=>{
 for(const code of['SOURCE_SCOPE_EMPTY','SOURCE_REGIONS_INVALID','SOURCE_SCOPE_UNSUPPORTED','SOURCE_SCOPE_OCR_UNSUPPORTED','SOURCE_REGION_PARTIAL_WINDOW','PDF_IMAGE_PAINT_UNSUPPORTED']){
  const error={code,message:'Original technical evidence'},fr=errorText(error,'fr'),en=errorText(error,'en');assert.notEqual(fr,en);assert(!fr.includes('Original technical evidence'));assert(!en.includes('Original technical evidence'));assert.equal(error.message,'Original technical evidence');assert.match(localizeStatus('Erreur · '+code+' Original technical evidence','fr'),/^Erreur · /);
 }
 assert.match(errorText({code:'SOURCE_SCOPE_UNSUPPORTED'},'fr'),/n’ont pas été analysés/);assert.match(errorText({code:'SOURCE_SCOPE_EMPTY'},'fr'),/aucun pixel/);
});

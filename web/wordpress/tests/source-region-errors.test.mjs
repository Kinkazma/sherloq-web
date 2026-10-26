import test from 'node:test';import assert from 'node:assert/strict';
import {errorText,localizeStatus} from '../sherloq-browser/assets/ui-errors.js';
test('scope errors explain no-data and unsupported paths without implying excluded pixels were computed',()=>{
 for(const code of['SOURCE_SCOPE_EMPTY','SOURCE_REGIONS_INVALID','SOURCE_SCOPE_UNSUPPORTED','SOURCE_SCOPE_OCR_UNSUPPORTED','SOURCE_REGION_PARTIAL_WINDOW','PDF_IMAGE_PAINT_UNSUPPORTED']){
  const error={code,message:'Original technical evidence'},fr=errorText(error,'fr'),en=errorText(error,'en');assert.notEqual(fr,en);assert(!fr.includes('Original technical evidence'));assert(!en.includes('Original technical evidence'));assert.equal(error.message,'Original technical evidence');assert.match(localizeStatus('Erreur · '+code+' Original technical evidence','fr'),/^Erreur · /);
 }
 assert.match(errorText({code:'SOURCE_SCOPE_UNSUPPORTED'},'fr'),/n’ont pas été analysés/);assert.match(errorText({code:'SOURCE_SCOPE_EMPTY'},'fr'),/aucun pixel/);
});

test('qualified source limitations explain the actual missing upstream adapter and preserve technical details',()=>{
 for(const limitation of ['SOURCE_UPSTREAM_MEMBERSHIP_UNQUALIFIED','SOURCE_NEIGHBORHOOD_MEMBERSHIP_UNQUALIFIED','ORIGINAL_ENCODED_SOURCE_REQUIRED','SOURCE_DCT_CROP_UNQUALIFIED','SOURCE_PAIRED_CROP_UNQUALIFIED','SOURCE_COORDINATES_UNLOCALIZED']){const error={code:'SOURCE_SCOPE_UNSUPPORTED',message:'Technical reason',details:{sourceRegionCapability:{limitation}}};const before=JSON.stringify(error);assert.notEqual(errorText(error,'fr'),errorText(error,'en'));assert.notEqual(errorText(error,'fr'),errorText({code:error.code},'fr'));assert.equal(JSON.stringify(error),before);}
 assert.match(errorText({code:'SOURCE_SCOPE_UNSUPPORTED',details:{sourceRegionCapability:{limitation:'SOURCE_UPSTREAM_MEMBERSHIP_UNQUALIFIED'}}},'fr'),/avant son calcul/);
 assert.equal(errorText({code:'SOURCE_SCOPE_UNSUPPORTED',details:{sourceRegionCapability:{limitation:'UNKNOWN_FUTURE'}}},'fr'),errorText({code:'SOURCE_SCOPE_UNSUPPORTED'},'fr'));
});

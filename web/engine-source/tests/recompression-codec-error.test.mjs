import test from 'node:test';
import assert from 'node:assert/strict';
import {serializeRecompressionCodecError} from '../src/recompression-codec-error.js';
import {deserializeEngineError,EngineError} from '../src/errors.js';

const context={codec:'jxl',width:3822,height:7716,quality:29,lossless:false,phase:'recompression-encode',nativeMaximumBytes:1482686464,codecHeapBytes:1426063360};

test('a native C++ exception survives transport with phase and pointer, without an invented memory diagnosis',()=>{
 class NativeException{constructor(pointer){this.excPtr=pointer;}}
 const wire=serializeRecompressionCodecError(new NativeException(123456),context),answer=deserializeEngineError(structuredClone(wire));
 assert.equal(answer.code,'RECOMPRESSION_FAILED');
 assert.match(answer.message,/JXL/);assert.match(answer.message,/recompression-encode/);assert.doesNotMatch(answer.message,/\[object Object\]|memory|allocation/i);
 assert.deepEqual(answer.details.codecFailure,{...context,thrownType:'object',nativeCppException:true,nativeExceptionPointer:123456});
});

test('ordinary codec diagnostics keep their primary message, code, stack and related Magick errors',()=>{
 const error=new Error('JXL delegate failed');error.severity=450;error.relatedErrors=[{message:'native delegate detail',severity:460}];
 const wire=serializeRecompressionCodecError(error,context);
 assert.equal(wire.message,error.message);assert.equal(wire.stack,error.stack);assert.equal(wire.code,'RECOMPRESSION_FAILED');
 assert.equal(wire.details.codecFailure.severity,450);
 assert.deepEqual(wire.details.codecFailure.relatedErrors,[{message:'native delegate detail',severity:460}]);
});

test('allocator evidence is classified by the existing resource normalizer',()=>{
 const wire=serializeRecompressionCodecError(new Error('Unable to allocate memory'),context);
 assert.equal(wire.code,'MEMORY_ALLOCATION');assert.match(wire.message,/allocate memory/);
 assert.equal(wire.details.codecFailure.codec,'jxl');
});

test('an object diagnostic retains its useful native text and bounded fields',()=>{
 const wire=serializeRecompressionCodecError({description:'JXL encoder rejected the frame',errno:7},context);
 assert.equal(wire.code,'RECOMPRESSION_FAILED');assert.equal(wire.message,'JXL encoder rejected the frame');
 assert.equal(wire.details.codecFailure.errno,7);assert.equal(wire.details.codecFailure.nativeCppException,undefined);
});

test('frozen external primaries and cleanup relations remain intact',()=>{
 const cleanup=new EngineError('STORAGE_IO','release rejected');
 const error=new EngineError('SOURCE_IO','source failed',{details:{source:'original'}});error.cleanupErrors=[cleanup];Object.freeze(error);
 const wire=serializeRecompressionCodecError(error,context),answer=deserializeEngineError(structuredClone(wire));
 assert.equal(answer.code,'SOURCE_IO');assert.equal(answer.message,'source failed');assert.equal(answer.details.source,'original');
 assert.equal(answer.cleanupErrors[0].code,'STORAGE_IO');assert.equal(error.details.codecFailure,undefined);
});

test('falsy and hostile diagnostics remain serializable and do not replace the primary',()=>{
 for(const value of [null,undefined,0,false]){
  const wire=serializeRecompressionCodecError(value,context);assert.equal(wire.message,String(value));assert.equal(wire.details.codecFailure.codec,'jxl');structuredClone(wire);
 }
 const error=Object.create(null);Object.defineProperty(error,'description',{get(){throw new Error('diagnostic getter');}});error.excPtr=456;
 const wire=serializeRecompressionCodecError(error,context);assert.match(wire.message,/Native C\+\+/);assert.equal(wire.details.codecFailure.nativeExceptionPointer,456);structuredClone(wire);
});

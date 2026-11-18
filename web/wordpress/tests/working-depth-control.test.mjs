import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {native16CapabilityParametersAdmitted,SEPARATION16_PARAMETER_RULES} from '../../engine-source/src/native16-parameter-contract.js';
import {sourceRegionDomainShape} from '../../engine-source/src/source-region-capabilities.js';
const app=readFileSync(new URL('../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function currentWorkingDepth(){'),app.indexOf('\nfunction adoptSourcePrecision('))+app.slice(app.indexOf('function syncWorkingDepthControl(){'),app.indexOf('\nfunction mountWorkingDepthControl('));
function fixture(){
 const select={options:[{},{}]},context=vm.createContext({native16CapabilityParametersAdmitted,sourceRegionDomainShape,experimentalRecompressionEnabled:()=>false,individualUI:{parameterState:()=>({}),params(){assert.fail('Precision must not invoke constrained params');}},nativeControlConstraints:{key:'current',shape:'identity'},nativeControlConstraintsKey:()=> 'current',workingDepthControl:{label:{},caption:{},select},nativeSourceSurface:{},sourcePrecisionCapabilities:null,native16Operations:new Set(['inspection.histogram']),sourceRegionsSnapshot:()=>null,sourceRegionsLocalOverride:false,regionController:null,activeAnalysis:'ela.classic',lang:'fr',busy:false,energyViewBusy:false,exportController:null,workingDepth:16});
 vm.runInContext(source,context);
 return {context,select,sync:()=>context.syncWorkingDepthControl()};
}
test('an SDR-only tool shows its actual 8-bit domain and cannot offer a false 16-bit calculation',()=>{
 const h=fixture();h.sync();assert.equal(h.select.value,'8');assert.equal(h.select.disabled,true);assert.equal(h.select.options[1].disabled,true);assert.match(h.select.title,/rendu SDR 8 bits/);assert.equal(h.context.workingDepth,16,'Keep the source precision preference for a later compatible tool');assert.equal(h.context.currentOperationWorkingDepth('ela.classic'),8);
});
test('returning to a native tool restores the 16-bit source preference',()=>{
 const h=fixture();h.sync();h.context.activeAnalysis='inspection.histogram';h.sync();assert.equal(h.select.value,'16');assert.equal(h.select.disabled,false);assert.equal(h.select.options[1].disabled,false);
});
test('native tools retain their busy lock and English depth information',()=>{
 const h=fixture();h.context.activeAnalysis='inspection.histogram';h.context.lang='en';h.context.busy=true;h.sync();assert.equal(h.select.disabled,true);assert.equal(h.select.value,'16');assert.equal(h.select.options[1].textContent,'16-bit · processing');
});
test('an 8-bit-only source keeps the precision selector hidden',()=>{
 const h=fixture();h.context.nativeSourceSurface=null;h.sync();assert.equal(h.context.workingDepthControl.label.hidden,true);
});
test('new native ports are admitted from the engine capability without a second UI registry',()=>{
 const h=fixture();h.context.sourcePrecisionCapabilities={operations:[{operation:'detail.gradient',native:true}]};h.context.activeAnalysis='detail.gradient';h.sync();assert.equal(h.select.value,'16');assert.equal(h.select.disabled,false);assert.equal(h.context.currentOperationWorkingDepth('detail.gradient'),16);assert.equal(h.context.currentOperationWorkingDepth('ela.classic'),8);
});
test('separation precision follows the actual mode,denoised setting and compiled source domain',()=>{
 const h=fixture(),capability={operation:'noise.separation',native:true,shapes:['identity'],parameterRules:SEPARATION16_PARAMETER_RULES};let params={mode:1,denoised:false};h.context.sourcePrecisionCapabilities={operations:[capability]};h.context.activeAnalysis='noise.separation';h.context.individualUI={parameterState:()=>params,params(){assert.fail('Precision must not invoke constrained params');}};
 for(const mode of[1,2]){params={mode,denoised:false};h.sync();assert.equal(h.select.value,'16');assert.equal(h.select.disabled,false);assert.equal(h.context.currentOperationWorkingDepth('noise.separation',params),16);}
 for(const value of[{mode:0,denoised:false},{mode:3,denoised:false},{mode:4,denoised:false},{mode:1,denoised:true}]){params=value;h.sync();assert.equal(h.select.value,'8');assert.equal(h.select.disabled,true);assert.equal(h.context.currentOperationWorkingDepth('noise.separation',params),8);assert.equal(h.context.workingDepth,16);}
 params={mode:1,denoised:false};for(const shape of['rectangle','membership','native-regions']){h.context.nativeControlConstraints.shape=shape;h.sync();assert.equal(h.select.value,'8');assert.equal(h.select.disabled,true);}
 h.context.nativeControlConstraints={key:'stale',shape:'identity'};h.sync();assert.equal(h.select.value,'8');h.context.nativeControlConstraints={key:'current',shape:'identity'};h.sync();assert.equal(h.select.value,'16');
 const domain={sourceWidth:4,sourceHeight:3,width:2,height:3,origin:[0,0],countIncluded:6};assert.equal(h.context.currentOperationWorkingDepth('noise.separation',params,domain),8);assert.equal(h.context.currentOperationWorkingDepth('noise.separation',params,null),16);
});
test('ordinary8bit separation and unported modes do not launch new native-scope preparation',()=>{const h=fixture(),fragment=app.slice(app.indexOf('function native16ConditionalScopeRequired(){'),app.indexOf('\nconst nativeControlOperation='));vm.runInContext(fragment,h.context);h.context.activeAnalysis='noise.separation';h.context.sourcePrecisionCapabilities={operations:[{operation:'noise.separation',native:true,shapes:['identity'],parameterRules:SEPARATION16_PARAMETER_RULES}]};h.context.individualUI={parameterState:()=>({mode:1,denoised:false}),params(){assert.fail('Precision must not invoke constrained params');}};assert.equal(h.context.native16ConditionalScopeRequired(),true);h.context.nativeSourceSurface=null;assert.equal(h.context.native16ConditionalScopeRequired(),false);h.context.nativeSourceSurface={};for(const params of[{mode:0,denoised:false},{mode:1,denoised:true}]){h.context.individualUI={parameterState:()=>params,params(){assert.fail('Precision must not invoke constrained params');}};assert.equal(h.context.native16ConditionalScopeRequired(),false);}});

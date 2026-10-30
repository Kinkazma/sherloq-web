import {d2prlInputSide} from './input-side.js';
import {D2PRL_FRAGMENT_ROLE_GRAPHS} from '../../src/d2prl-fragment-role-graph.js';
import {D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS} from '../../src/d2prl-fragment-role-routing-graph.js';
import {requireValue} from '../../src/errors.js';
export function strictRoleContract(part,inputSide=448){
 const side=d2prlInputSide(inputSide);
 const simple=Object.hasOwn(D2PRL_FRAGMENT_ROLE_GRAPHS,part)?D2PRL_FRAGMENT_ROLE_GRAPHS[part]:null,c=simple?{inputs:[{name:simple.input,shape:simple.inputShape}],outputs:[{name:simple.output,shape:simple.outputShape}]}:Object.hasOwn(D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS,part)?D2PRL_FRAGMENT_ROLE_ROUTING_GRAPHS[part]:null;
 requireValue(c,'An exact pinned native role stage is required.');return side===448?c:{inputs:c.inputs.map(p=>({...p,shape:p.shape.map((v,i)=>p.shape[3]===2?(i===1||i===2?v*side/448:v):(i>=2?v*side/448:v))})),outputs:c.outputs.map(p=>({...p,shape:p.shape.map((v,i)=>p.shape[3]===2?(i===1||i===2?v*side/448:v):(i>=2?v*side/448:v))}))};
}
export function validateStrictRoleFeeds(part,feeds,inputSide=448){const c=strictRoleContract(part,inputSide);requireValue(feeds&&Object.keys(feeds).length===c.inputs.length&&c.inputs.every(p=>feeds[p.name] instanceof Float32Array&&feeds[p.name].length===p.shape.reduce((n,v)=>n*v,1)),'Strict role feeds differ from their original tensor boundary.');return c;}

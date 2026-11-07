export const D2PRL_INPUT_SIDES=Object.freeze([448,896,1344,1792]);
export function d2prlInputSide(value=448){
 if(!Number.isInteger(value)||!D2PRL_INPUT_SIDES.includes(value))throw Object.assign(new Error('D2PRL input side must be 448, 896, 1344 or 1792.'),{code:'INVALID_INPUT'});
 return value;
}

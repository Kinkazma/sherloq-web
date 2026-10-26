import test from 'node:test';
import {proofNames,runOwnershipProof} from './source-region-ocr-retirement-proof.js';
for(const[index,name]of proofNames.entries())test(name,()=>runOwnershipProof(index));

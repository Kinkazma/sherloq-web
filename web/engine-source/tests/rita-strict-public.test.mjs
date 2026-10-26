import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolClient} from '../../wordpress/sherloq-browser/assets/tool-client.js';
import {runRitaStrictPublicProof} from './helpers/rita-strict-public-proof.mjs';
test('actual public ToolClient projects retained RITA context fields for every view and scalar consumer',{timeout:5000},async()=>{const result=await runRitaStrictPublicProof(createToolClient);assert(result.passed);assert(result.checks.length>390);});

import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {acquireMigrationWorkspace} from '../src/migration-workspace.js';
import {densePreparationMigrationBytes,planDensePreparation} from '../src/dense-preparation-plan.js';

test('only the missing shared migration capacity affects a resident preparation decision',async()=>{
 const budget=new Budget(2000),session={backend:'indexeddb',snapshot:()=>({pageBytes:100})},options={temporarySession:session},request={availableBytes:1000,dataBytes:700,workspaceBytes:250,ioBytes:50,total:4,maxWorkers:4};
 const initial=densePreparationMigrationBytes(budget,700,options);assert.equal(initial,200);assert.equal(budget.total(),0);
 assert.equal(planDensePreparation({...request,migrationBytes:initial}).resident,false);
 const partial=acquireMigrationWorkspace(budget,120);let rest;
 try{
  assert.equal(densePreparationMigrationBytes(budget,700,options),80);
  rest=acquireMigrationWorkspace(budget,200);assert.equal(densePreparationMigrationBytes(budget,700,options),0);
  assert.equal(planDensePreparation({...request,migrationBytes:0}).resident,true);assert.equal(budget.total(),200);
  assert.equal(densePreparationMigrationBytes(budget,700,{temporarySession:{backend:'opfs'}}),0);
 }finally{await rest?.release();await partial.release();}
 assert.equal(budget.total(),0);
});

test('external preparation remains admissible when its worker fits but RAM and migration do not',()=>{
 const plan=planDensePreparation({availableBytes:300,dataBytes:700,workspaceBytes:250,ioBytes:50,migrationBytes:200,total:1,maxWorkers:4});
 assert.equal(plan.resident,false);assert.equal(plan.storage,'auto');assert.equal(plan.workers,1);
});

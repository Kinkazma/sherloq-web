import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createReservationScope} from '../src/reservation-scope.js';

test('sequential operations reuse their admitted bytes without another budget reservation',()=>{
 const budget=new Budget(100),scope=createReservationScope(budget.reserve(100));
 for(let i=0;i<100;i++){const release=scope.reserve(100);assert.equal(budget.total(),100);release();release();}
 assert.equal(budget.peak,100);scope.close();assert.equal(budget.total(),0);
});

test('closing an operation retains its allowance until every live buffer is released',()=>{
 const budget=new Budget(100),scope=createReservationScope(budget.reserve(100)),first=scope.reserve(40),second=scope.reserve(60);
 assert.throws(()=>scope.reserve(1),{code:'MEMORY_LIMIT'});scope.close();scope.close();assert.equal(budget.total(),100);
 assert.throws(()=>scope.reserve(0),{code:'DISPOSED'});first();assert.equal(budget.total(),100);second();assert.equal(budget.total(),0);
});

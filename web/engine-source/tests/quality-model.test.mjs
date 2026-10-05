import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {compileQualityModel} from '../src/quality-model.js';import {compileMedianModel} from '../src/median-model.js';
const leaf=value=>({tree_param:{num_nodes:'1',num_feature:'100',num_deleted:'0',size_leaf_vector:'0'},left_children:[-1],right_children:[-1],split_indices:[0],split_conditions:[value],default_left:[0],split_type:[0],categories:[],categories_nodes:[],categories_segments:[],categories_sizes:[]});
const saved=(trees=[leaf(2)])=>({version:[2,0,3],learner:{learner_model_param:{base_score:'5E-1',boost_from_average:'0',num_class:'0',num_feature:'100',num_target:'1'},objective:{name:'reg:squarederror'},gradient_booster:{name:'gbtree',model:{gbtree_model_param:{num_trees:String(trees.length),num_parallel_tree:'1'},trees,tree_info:trees.map(()=>0)}}}});
const encode=x=>new TextEncoder().encode(JSON.stringify(x));
test('Quality regression starts with float32 base score, keeps sequential rounding and never clips or sigmoids',async()=>{
 const budget=new Budget(4*1024**2);
 for(const [leaves,expected] of [[[-2],-1.5],[[150],150.5],[[16777216,-16777216],0]]){
  const model=await compileQualityModel(encode(saved(leaves.map(leaf))),{budget}),prediction=await model.predict(new Float64Array(100));assert.equal(prediction.scores[0],expected);assert.equal(prediction.margins[0],expected);prediction.release();model.dispose();assert.equal(budget.total(),0);
 }
});
test('Quality and median readers keep separate feature/objective contracts and reject unqualified base scores',async()=>{
 const budget=new Budget(4*1024**2),object=saved();await assert.rejects(compileMedianModel(encode(object),{budget}),{code:'UNSUPPORTED_MODEL'});
 for(const change of [x=>x.learner.objective.name='binary:logistic',x=>x.learner.learner_model_param.num_feature='128',x=>x.learner.learner_model_param.base_score='.6']){const invalid=saved();change(invalid);await assert.rejects(compileQualityModel(encode(invalid),{budget}),{code:'UNSUPPORTED_MODEL'});assert.equal(budget.total(),0);}
 const model=await compileQualityModel(encode(saved([leaf(3e38),leaf(3e38)])),{budget});await assert.rejects(model.predict(new Float64Array(100)),{code:'NUMERIC_RANGE'});assert.equal(budget.active,0);model.dispose();assert.equal(budget.total(),0);
});

import vm from 'node:vm';import fs from 'node:fs';import assert from 'node:assert/strict';
import { TEACHING_MODULES } from '../functions/_lib/teaching-material.js';
const cohort={id:'test-cohort',name:'Test cohort'};const nodes=new Map();
const el={innerHTML:'',querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{dataset:{},addEventListener(){},focus(){}});return nodes.get(selector)},querySelectorAll(){return []}};
let stored=null,revision=0,fail=false;
const c={console,CONSOLE:{cohorts:[cohort]},ME:{profile:{email:'teacher@test'}},activeCohort:()=>cohort,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),document:{getElementById:()=>({focus(){}})},renderTeachingResources(){},fetch:async(url,opt)=>{
 if(opt?.method==='POST'){if(fail)return{ok:false,status:503,json:async()=>({error:'Unavailable'})};const p=JSON.parse(opt.body);stored=p.state;return{ok:true,json:async()=>({revision:++revision})}}
 return{ok:true,json:async()=>({modules:TEACHING_MODULES,progress:{revision,state:stored}})}},el,assert};
vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../assets/teaching-guide.js',import.meta.url),'utf8'),c);
await vm.runInContext("GUIDE.owner=ME.profile.email;loadGuide('test-cohort',el)",c);
const count=TEACHING_MODULES.flatMap(m=>m.tasks).reduce((n,t)=>n+t.sections.length,0);
for(let i=0;i<count;i++){
 assert.ok(el.innerHTML.includes('Instructor notes'));assert.ok(el.innerHTML.includes('READ THE CORE COMPETENCY'));
 await vm.runInContext('saveGuide(guideMove(1),el)',c);
}
assert.ok(el.innerHTML.includes('Every discussion, covered'));assert.equal(Object.keys(stored.done).length,87);
await vm.runInContext("loadGuide('test-cohort',el)",c);assert.ok(el.innerHTML.includes('Every discussion, covered'));
fail=true;const before=JSON.stringify(stored);await vm.runInContext('saveGuide(guideInitial(),el)',c);assert.equal(JSON.stringify(stored),before);assert.ok(el.innerHTML.includes('Your last action was not saved'));
console.log('Teaching UI: all 87 transitions, server restore, completion and failed-save retention passed.');

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { install, DB } from './pgrest-mock.mjs';
import { makeSessionCookie } from '../functions/_lib/session.js';
import { onRequest } from '../functions/api/classroom/teaching.js';
import { onRequest as blockProposal } from '../functions/proposal/[[path]].js';
const env={SUPABASE_URL:'https://teaching.test',SUPABASE_SERVICE_ROLE_KEY:'test-only',CLASSROOM_SESSION_SECRET:'test-only',CLASSROOM_ADMINS:'admin@example.test'};install(env.SUPABASE_URL);
const people=['instructor','other','student','admin'].map((role)=>({id:randomUUID(),email:role+'@example.test',role:role==='other'?'instructor':role}));DB.pl_students=people;
const cohort={id:randomUUID(),instructor_email:people[0].email,tracks_allowed:['RBLP']};DB.pl_cohorts=[cohort];DB.pl_cohort_members=[{cohort_id:cohort.id,rblp_type:'RBLP'}];
const cookies=await Promise.all(people.map(p=>makeSessionCookie(env,p.id,p.email)));
async function call(who=0,state,revision=0,cohortId=cohort.id,origin='https://promoteandlead.com'){
 const request=new Request('https://promoteandlead.com/api/classroom/teaching?cohort='+cohortId,{method:state?'POST':'GET',headers:{...(who===null?{}:{Cookie:cookies[who]}),'Content-Type':'application/json',Origin:origin},...(state?{body:JSON.stringify({cohort_id:cohortId,state,revision})}:{})});
 return onRequest({request,env});
}
assert.equal((await call(null)).status,401);assert.equal((await call(2)).status,403);assert.equal((await call(1)).status,403);assert.equal((await call(0,null,0,'invalid')).status,400);
let res=await call();assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');let data=await res.json();assert.equal(data.modules.length,3);assert.equal(data.progress.revision,0);
const state={module:0,task:0,section:1,finished:false,done:{'m1_analyze_climate:0':true}};
assert.equal((await call(0,state,0,cohort.id,'https://unrelated.test')).status,403);
assert.equal((await call(0,{...state,module:4})).status,400);
assert.equal((await call(0,{...state,done:{'m5_analyze_org:0':true}})).status,400);
assert.equal((await call(0,state)).status,200);assert.equal((await call(0,state)).status,409);
assert.deepEqual((await(await call()).json()).progress.state,state);
assert.equal((await call(0,{...state,section:2},1)).status,200);
assert.equal((await call(0,state,1)).status,409);
assert.equal((await(await call(3)).json()).progress.state,null); // another staff account has its own place
assert.equal((await call(3,state)).status,200);
assert.equal(DB.pl_teaching_progress.length,2);
assert.equal((await blockProposal()).status,404);
assert.equal((await call(3,null,0,randomUUID())).status,404);
console.log('Teaching API: authentication, ownership, track limits, validation, cross-device persistence and conflicts passed.');

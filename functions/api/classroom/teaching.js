import { sb, json } from "../../_lib/db.js";
import { currentStudent } from "../../_lib/session.js";
import { TEACHING_MODULES } from "../../_lib/teaching-material.js";
import { TRACKS, normalizeTrack } from "../../_lib/classroom.js";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(body,status=200)=>{const r=json(body,status);r.headers.set('Cache-Control','private, no-store');return r};
export function validTeachingState(state,modules){
 if(!state || typeof state!=='object'||Array.isArray(state)||Object.keys(state).some(k=>!['module','task','section','finished','done'].includes(k)))return false;
 const {module,task,section,finished,done}=state;
 if(!Number.isInteger(module)||module<0||module>=modules.length||!Number.isInteger(task)||task<0||task>=modules[module].tasks.length)return false;
 if(!Number.isInteger(section)||section<0||section>=modules[module].tasks[task].sections.length||typeof finished!=='boolean'||!done||typeof done!=='object'||Array.isArray(done))return false;
 const keys=new Set(modules.flatMap(m=>m.tasks.flatMap(t=>t.sections.map((s,i)=>t.key+':'+i))));
 return Object.entries(done).every(([k,v])=>keys.has(k)&&v===true);
}
export async function onRequest({request,env}){
 if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed.'},405);
 const db=sb(env);if(!db.enabled)return reply({error:'Classroom not configured.'},503);
 try{
 const me=await currentStudent(request,env,db);
 if(!me)return reply({error:'Please sign in again.'},401);
 if(!['admin','instructor'].includes(me.role))return reply({error:'Instructor access required.'},403);
 const url=new URL(request.url);
 let payload=null;
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==url.origin)return reply({error:'Same-origin request required.'},403);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'JSON required.'},400);
  const reader=request.body?.getReader();if(!reader)return reply({error:'Missing progress.'},400);
  let text='',bytes=0;const decoder=new TextDecoder();
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>24000){await reader.cancel();return reply({error:'Progress too large.'},413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode();
  try{payload=JSON.parse(text)}catch{return reply({error:'Invalid JSON.'},400)}
 }
 const id=request.method==='GET'?url.searchParams.get('cohort'):payload?.cohort_id;
 if(typeof id!=='string'||!uuid.test(id))return reply({error:'Select a valid cohort.'},400);
 const cohorts=await db.select('pl_cohorts',`select=id,instructor_email,tracks_allowed&id=eq.${id}&limit=1`);
 if(!cohorts.length)return reply({error:'Cohort not found.'},404);
 if(me.role!=='admin'&&(cohorts[0].instructor_email||'').toLowerCase()!==me.email.toLowerCase())return reply({error:"That cohort isn't yours."},403);
 const members=await db.select('pl_cohort_members',`select=rblp_type&cohort_id=eq.${id}`);
 const tracks=members.length?members.map(m=>normalizeTrack(m.rblp_type)):(Array.isArray(cohorts[0].tracks_allowed)&&cohorts[0].tracks_allowed.length?cohorts[0].tracks_allowed:Object.keys(TRACKS));
 const max=Math.max(...tracks.map(t=>Math.max(...(TRACKS[normalizeTrack(t)]?.modules||[1,2,3]))));
 const modules=TEACHING_MODULES.filter(m=>m.num<=max);
 const query=`cohort_id=eq.${id}&instructor_id=eq.${me.id}`;
 if(request.method==='GET'){
  const rows=await db.select('pl_teaching_progress',`select=revision,state,updated_at&${query}&limit=1`);
  return reply({modules,progress:rows[0]||{revision:0,state:null}});
 }
 if(!Number.isInteger(payload.revision)||payload.revision<0||!validTeachingState(payload.state,modules))return reply({error:'Invalid teaching progress.'},400);
 const row={state:payload.state,revision:payload.revision+1,updated_at:new Date().toISOString()};
 if(payload.revision===0){
  try{await db.insert('pl_teaching_progress',{...row,cohort_id:id,instructor_id:me.id})}catch(error){if(String(error).includes('409'))return reply({error:'Another device saved progress. Reload to continue.'},409);throw error}
 }else{
  const rows=await db.patch('pl_teaching_progress',`${query}&revision=eq.${payload.revision}`,row,{representation:true});
  if(!rows?.length)return reply({error:'Another device saved progress. Reload to continue.'},409);
 }
 return reply({revision:row.revision,updated_at:row.updated_at});
 }catch(error){console.error(JSON.stringify({event:'teaching_progress_failed'}));return reply({error:'Teaching progress is temporarily unavailable. Please retry.'},503)}
}

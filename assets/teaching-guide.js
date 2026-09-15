/* Authenticated instructor flow. Progress belongs to a signed-in instructor and cohort. */
var GUIDE = {cohort:null, modules:[], state:null, revision:0, busy:false, error:'', conflict:false, loading:false, request:0};
function guideInitial(){return {module:0,task:0,section:0,finished:false,done:{}}}
function guideFocus(){var node=document.getElementById('teaching-title');if(node)node.focus()}
function guideNotes(s){
 var c=s.coaching;if(!c)return '';
 return '<details class="instructor-coaching" '+(GUIDE.notesOpen?'open':'')+'><summary><span><b>Instructor notes</b><small>What to listen for · Examples · Follow-up prompts</small></span><span class="coaching-chevron" aria-hidden="true">+</span></summary><div class="coaching-body"><p class="coaching-attribution"><strong>Promote &amp; Lead coaching guidance</strong>Interpretation of the supplied reading, not an official RBLP answer key or scoring rubric. Examples are illustrative; learners should use their own experience.</p>'+guideNoteBlock('The main idea','<p>'+esc(c.idea)+'</p>')+guideNoteBlock('What to listen for','<ul>'+c.listenFor.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul><p class="coaching-hint">Listen for specific actions, reasoning, and what happened or was learned. Different experiences can show the same understanding.</p>')+guideNoteBlock('One possible response','<blockquote>'+esc(c.sampleResponse)+'</blockquote>')+guideNoteBlock('If the answer needs more depth','<ul>'+c.followUps.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>')+'<section class="coaching-caution"><h3>Common misunderstanding</h3><p>'+esc(c.misunderstanding)+'</p></section></div></details>';
}
function guideNoteBlock(title,html){return '<section><h3>'+title+'</h3>'+html+'</section>'}
async function loadGuide(cohort,el){
 var ticket=++GUIDE.request;GUIDE.loading=true;GUIDE.busy=false;GUIDE.cohort=cohort;GUIDE.error='';GUIDE.state=null;
 try{
  var response=await fetch('/api/classroom/teaching?cohort='+encodeURIComponent(cohort),{cache:'no-store'});var out=await response.json();
  if(ticket!==GUIDE.request)return;
  if(!response.ok)throw new Error(out.error||'Could not load your guide.');
  GUIDE.modules=out.modules;GUIDE.state=out.progress.state||guideInitial();GUIDE.revision=out.progress.revision;GUIDE.conflict=false;
  // A changed cohort track may remove later modules. Require an explicit restart of position rather than discard completion.
  if(!GUIDE.modules[GUIDE.state.module]||!GUIDE.modules[GUIDE.state.module].tasks[GUIDE.state.task]||!GUIDE.modules[GUIDE.state.module].tasks[GUIDE.state.task].sections[GUIDE.state.section]){
   GUIDE.state=guideInitial();GUIDE.error='The cohort track changed. Select your place in the current module list.';
  }
 }catch(e){if(ticket===GUIDE.request)GUIDE.error=e.message}
 finally{if(ticket===GUIDE.request){GUIDE.loading=false;renderTeaching(el)}}
}
async function saveGuide(next,el){
 if(GUIDE.busy||GUIDE.conflict)return;
 var saveCohort=GUIDE.cohort,saveOwner=GUIDE.owner,saveTicket=GUIDE.request;
 GUIDE.busy=true;GUIDE.error='';renderTeaching(el);
 try{
  var response=await fetch('/api/classroom/teaching',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cohort_id:GUIDE.cohort,revision:GUIDE.revision,state:next})});
  var out=await response.json();if(saveTicket!==GUIDE.request||saveOwner!==GUIDE.owner)return;if(!response.ok){GUIDE.conflict=response.status===409;throw new Error(out.error||'Could not save progress.')}
  GUIDE.state=next;GUIDE.revision=out.revision;
 }catch(e){if(saveTicket===GUIDE.request&&saveOwner===GUIDE.owner)GUIDE.error=e.message}
 finally{if(saveTicket===GUIDE.request&&saveOwner===GUIDE.owner){GUIDE.busy=false;renderTeaching(el);guideFocus()}}
}
function guideMove(direction){
 var next=JSON.parse(JSON.stringify(GUIDE.state)),mods=GUIDE.modules,m=mods[next.module],t=m.tasks[next.task];
 if(direction>0){
  next.done[t.key+':'+next.section]=true;
  if(next.section<t.sections.length-1)next.section++;
  else if(next.task<m.tasks.length-1){next.task++;next.section=0}
  else if(next.module<mods.length-1){next.module++;next.task=0;next.section=0}
  else next.finished=true;
 }else if(next.section>0)next.section--;else if(next.task>0){next.task--;next.section=m.tasks[next.task].sections.length-1}else if(next.module>0){next.module--;next.task=mods[next.module].tasks.length-1;next.section=mods[next.module].tasks[next.task].sections.length-1}
 return next;
}
function renderTeaching(el){
 if(!CONSOLE){el.innerHTML='<div class="box"><p>Sign in with an instructor account to open the teaching guide.</p></div>';return}
 if(GUIDE.owner!==ME.profile.email){GUIDE={notesOpen:GUIDE.notesOpen,owner:ME.profile.email,cohort:null,modules:[],state:null,revision:0,busy:false,error:'',conflict:false,loading:false,request:GUIDE.request+1}}
 var cohort=activeCohort();
 if(!cohort){el.innerHTML='<div class="box"><h2>Your teaching guide</h2><p>No cohort is assigned yet. An administrator can assign one from the Admin view.</p></div>';return}
 if(GUIDE.cohort!==cohort.id){el.innerHTML='<div class="box" role="status">Loading your saved teaching guide…</div>';loadGuide(cohort.id,el);return}
 if(GUIDE.loading){el.innerHTML='<div class="box" role="status">Loading your saved teaching guide…</div>';return}
 if(!GUIDE.state){el.innerHTML='<div class="box"><p class="err">'+esc(GUIDE.error)+'</p><button class="btn btn-green" id="guideReload">Retry loading</button></div>';document.getElementById('guideReload').onclick=function(){loadGuide(cohort.id,el)};return}
 var mods=GUIDE.modules,st=GUIDE.state,m=mods[st.module],t=m.tasks[st.task],s=t.sections[st.section];
 var all=mods.flatMap(function(m){return m.tasks.flatMap(function(t){return t.sections.map(function(s,i){return t.key+':'+i})})});
 var done=all.filter(function(k){return st.done[k]}).length;
 var saved=GUIDE.busy?'Saving to your account…':GUIDE.error?'Your last action was not saved':GUIDE.revision?'Your place is saved':'Ready to teach';
 var actionsDisabled=GUIDE.busy||GUIDE.conflict;
 var selector='<div class="teaching-selects"><label class="fld"><span>Cohort</span><select id="guideCohort" '+(GUIDE.busy?'disabled':'')+'>'+CONSOLE.cohorts.map(function(c){return '<option value="'+esc(c.id)+'" '+(c.id===cohort.id?'selected':'')+'>'+esc(c.slug||c.name)+'</option>'}).join('')+'</select></label><label class="fld"><span>Module</span><select id="guideModule" '+(actionsDisabled?'disabled':'')+'>'+mods.map(function(m,i){return '<option value="'+i+'" '+(i===st.module?'selected':'')+'>Module '+m.num+' · '+esc(m.title)+'</option>'}).join('')+'</select></label></div>';
 var header='<div class="teaching-heading"><div><h2>Read. Discuss. Move forward.</h2><p>One competency at a time, with your place remembered.</p><div class="teaching-progress"><span>'+done+' of '+all.length+' discussions done</span><progress max="'+all.length+'" value="'+done+'" aria-label="Guide completion"></progress></div></div>'+selector+'</div>';
 var checklist='<aside class="card teaching-checklist"><div class="eyebrow">MODULE '+m.num+'</div><h3>'+esc(m.title)+'</h3><nav class="task-nav" aria-label="Competencies">'+m.tasks.map(function(t,i){var n=t.sections.filter(function(s,j){return st.done[t.key+':'+j]}).length;return '<button data-guide-task="'+i+'" '+(actionsDisabled?'disabled':'')+' class="'+(i===st.task?'active':'')+'" '+(i===st.task?'aria-current="step"':'')+'><span>'+(n===t.sections.length?'✓':i+1)+'</span><span>'+esc(t.title)+'<small>'+n+' / '+t.sections.length+' discussions done</small></span></button>'}).join('')+'</nav><div class="note" role="status" aria-live="polite"><b>'+saved+'</b>'+(GUIDE.error?esc(GUIDE.error):GUIDE.busy?'Wait for confirmation before leaving.':'Resume on any device by signing into this account and selecting this cohort.')+(GUIDE.conflict?'<button class="btn btn-ghost btn-sm" id="guideReload">Load latest progress</button>':'')+'</div></aside>';
 var content;
 if(st.finished){content='<section class="card teaching-complete"><h2 id="teaching-title" tabindex="-1">'+(done===all.length?'Every discussion, covered.':'You’ve reached the end of the guide.')+'</h2><p>'+done+' of '+all.length+' discussions completed. Teaching progress does not issue a training certificate.</p><button class="btn btn-green" id="guideUnfinished" '+(actionsDisabled?'disabled':'')+'>'+(done===all.length?'Review the first discussion':'Continue unfinished discussions')+'</button></section>'}
 else{content='<article class="card teaching-reader"><header class="teaching-reader-head"><div class="eyebrow">MODULE '+m.num+' · COMPETENCY '+(st.task+1)+' OF '+m.tasks.length+'</div><h2 id="teaching-title" tabindex="-1">'+esc(t.title)+'</h2><div class="teaching-meta"><span>Discussion '+(st.section+1)+' of '+t.sections.length+'</span><span class="tag">Read · Example · Discuss</span></div><nav class="discussion-tabs" aria-label="Discussions">'+t.sections.map(function(s,i){return '<button data-guide-section="'+i+'" '+(actionsDisabled?'disabled':'')+' '+(i===st.section?'aria-current="step"':'')+' aria-label="Discussion '+(i+1)+(st.done[t.key+':'+i]?', completed':'')+'">'+(st.done[t.key+':'+i]?'✓ ':'')+(i+1)+'</button>'}).join('')+'</nav></header><section class="teaching-reading"><div class="eyebrow">01 · READ THE CORE COMPETENCY</div>'+s.reading.map(function(x){return '<p>'+esc(x)+'</p>'}).join('')+'</section><section class="teaching-example"><div class="eyebrow">02 · SHARE THE EXAMPLE</div>'+s.example.map(function(x){return '<p>'+esc(x)+'</p>'}).join('')+'</section><section class="teaching-questions"><div class="eyebrow">03 · ASK THE ROOM</div><ol>'+s.questions.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ol>'+guideNotes(s)+'</section><footer class="teaching-actions"><button class="btn btn-ghost" id="guideBack" '+(actionsDisabled||(!st.module&&!st.task&&!st.section)?'disabled':'')+'>← Previous</button><button class="btn btn-green" id="guideNext" '+(actionsDisabled?'disabled':'')+'>'+(GUIDE.busy?'Saving…':st.section===t.sections.length-1?'Done · Next competency →':'Done & next →')+'</button></footer><p class="teaching-source">Source: '+esc(t.source)+' · p. '+s.page+'. Instructor notes are Promote &amp; Lead coaching guidance.</p></article>'}
 el.innerHTML=header+'<div class="teaching-layout">'+content+checklist+'</div><details class="teaching-resource box"><summary>Additional teaching resources, run of day, and facilitation guide</summary><div id="guideResources"></div></details>';
 var notes=el.querySelector('.instructor-coaching');if(notes)notes.addEventListener('toggle',function(){if(notes.isConnected)GUIDE.notesOpen=notes.open});
 var resources=el.querySelector('.teaching-resource');resources.addEventListener('toggle',function(){if(resources.open&&!resources.dataset.loaded){renderTeachingResources(el.querySelector('#guideResources'));resources.dataset.loaded='true'}});
 var cs=el.querySelector('#guideCohort');cs.onchange=function(){ACTIVE_COHORT=cs.value;renderTeaching(el)};
 var ms=el.querySelector('#guideModule');ms.onchange=function(){var n=JSON.parse(JSON.stringify(st));n.module=Number(ms.value);n.task=0;n.section=0;n.finished=false;saveGuide(n,el)};
 el.querySelectorAll('[data-guide-task],[data-guide-section]').forEach(function(b){b.onclick=function(){var n=JSON.parse(JSON.stringify(st));if(b.dataset.guideTask!==undefined){n.task=Number(b.dataset.guideTask);n.section=0}else n.section=Number(b.dataset.guideSection);n.finished=false;saveGuide(n,el)}});
 var b=el.querySelector('#guideBack');if(b)b.onclick=function(){saveGuide(guideMove(-1),el)};
 b=el.querySelector('#guideNext');if(b)b.onclick=function(){saveGuide(guideMove(1),el)};
 b=el.querySelector('#guideReload');if(b)b.onclick=function(){loadGuide(cohort.id,el)};
 b=el.querySelector('#guideUnfinished');if(b)b.onclick=function(){var n=JSON.parse(JSON.stringify(st));n.finished=false;n.module=0;n.task=0;n.section=0;outer:for(var mi=0;mi<mods.length;mi++)for(var ti=0;ti<mods[mi].tasks.length;ti++)for(var si=0;si<mods[mi].tasks[ti].sections.length;si++)if(!n.done[mods[mi].tasks[ti].key+':'+si]){n.module=mi;n.task=ti;n.section=si;break outer}saveGuide(n,el)};
}

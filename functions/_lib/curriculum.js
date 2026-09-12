// Classroom curriculum outline — the shared "sheet of music" for students and instructors.
//
// LICENCE BOUNDARY (read before editing): RBLP owns the curriculum. This file holds only
//   (a) the leader-task OUTLINE (titles/order) so worksheets line up with the official modules,
//   (b) Tommy's own coaching starters + glossary one-liners from the P&L content pack, and
//   (c) deep links to the official modules on rblp.com.
// Never paste RBLP module body prose or PDF text in here — students read the real modules on
// rblp.com with the month password.

// Saturday windows and payback hours are the academy-locked shapes (5 Sep 2026). An earlier
// note put Trainer at 8h instructional — that was withdrawn; the wall clock ends 15:30.
// reflectionHours is RBLP's own published requirement — hours of personal reflection on your
// leader/follower experience before the course. That IS the prep work, and naming the number
// turns it from homework we're nagging about into the credential's own standard.
// examHours are rblp.com's operational oral lengths, which is what we tell candidates. ACE's
// National Guide lists longer Coach/Trainer orals — that record is for credit conversations,
// not for scheduling, so don't "correct" these against it.
// `who` / `about` / `experience` are the same words as the marketing site's certification
// cards, so somebody who read the site and then signed up sees the level they thought they
// were choosing. Picking a level is the first real decision a student makes and they make it
// with no context otherwise — "RBLP-C" means nothing on its own.
export const TRACKS = {
  RBLP: {
    label: "RBLP", modules: [1, 2, 3], paybackHours: 3, reflectionHours: 6,
    window: "09:00–12:30", examHours: 1.5,
    who: "First-line and aspiring supervisors",
    experience: "Typically 2+ years leading a team",
    about: "For supervisors who build and lead resilient teams — creating a positive climate, cohesion and shared purpose.",
    covers: "Team Climate, Team Cohesion, Individual Purpose"
  },
  "RBLP-C": {
    label: "RBLP-C", modules: [1, 2, 3, 4], paybackHours: 4, reflectionHours: 8,
    window: "09:00–14:30", examHours: 2,
    who: "Managers, and Army warrant officers W1–W3",
    experience: "Typically 5+ years",
    about: "For managers who coach a team through the cycle of experiential learning — solving problems, implementing change, improving continuously.",
    covers: "Everything in RBLP, plus Team Learning"
  },
  "RBLP-T": {
    label: "RBLP-T", modules: [1, 2, 3, 4, 5], paybackHours: 5, reflectionHours: 10,
    window: "09:00–15:30", examHours: 2.5,
    who: "Senior managers, and Army warrant officers W3–W5",
    experience: "Typically 10+ years",
    about: "For senior leaders who build organizational resilience and develop leader training programs using the RBLP framework.",
    covers: "Everything in RBLP-C, plus Organizational Learning"
  }
};

export const MODULES = [
  {
    num: 1,
    title: "Team Climate",
    url: "https://rblp.com/exam-prep-training/module-1-team-climate/",
    theme: "Climate is the shared attitudes and emotions people experience on a team. Climate changes quickly; culture changes slowly.",
    glossary: [
      ["Climate", "Shared attitudes and emotions right now"],
      ["Culture", "Shared values and beliefs underneath"],
      ["Competence", "Can do the job"],
      ["Integrity", "Will do the right thing"],
      ["Authenticity", "Transparent about thoughts, emotions, values"],
      ["Vulnerability", "Willing to accept emotional exposure"],
      ["Active Listening", "Listen to understand, not to respond"],
      ["Accountability", "Firm, fair, consistent — usually about learning"],
      ["Proactive Coping", "Preparing mentally for expected adversity"]
    ],
    tasks: [
      { key: "m1_analyze_climate",   title: "Analyze Team Climate",                what: "Shared attitudes and emotions of the team.",         why: "Improves morale, creativity, resilience." },
      { key: "m1_earn_trust",        title: "Earn Trust",                          what: "Trust = competence + integrity.",                    why: "Trusted leaders get greater effort." },
      { key: "m1_respect",           title: "Treat People with Respect",           what: "Value people and provide equal opportunities.",      why: "Builds morale and inclusion." },
      { key: "m1_accountability",    title: "Enforce Accountability",              what: "Hold people responsible for standards.",             why: "Creates fairness and trust." },
      { key: "m1_fun",               title: "Encourage People to Have Fun",        what: "Create positive emotions.",                          why: "Reduces stress and strengthens relationships." },
      { key: "m1_adversity",         title: "Manage Expectations About Adversity", what: "Prepare for setbacks.",                              why: "Builds resilience." },
      { key: "m1_be_there",          title: "Be There When the Going Gets Tough",  what: "Stay engaged during adversity.",                     why: "Builds trust and commitment." }
    ]
  },
  {
    num: 2,
    title: "Team Cohesion",
    url: "https://rblp.com/exam-prep-training/module-2-team-cohesion/",
    theme: "Cohesion is the bond that holds a team together when things get hard — built on trust, respect and a shared mission.",
    glossary: [
      ["Cohesion", "The bond that keeps a team together"],
      ["Social Cohesion", "The relationships between members"],
      ["Task Cohesion", "Working toward shared goals"],
      ["Shared Leadership", "Leadership distributed across the team"],
      ["Social Trust", "Faith in each other's intentions"],
      ["Task Trust", "Faith in each other's performance"],
      ["Transparency", "Open, honest communication"],
      ["Mission", "The purpose that focuses the team"],
      ["AAR", "After-action review — learning from what happened"]
    ],
    tasks: [
      { key: "m2_analyze_cohesion",  title: "Analyze Team Cohesion",                            what: "Cohesion is the bond that keeps a team united during adversity.", why: "" },
      { key: "m2_organize_teams",    title: "Organize People to Work in Teams",                 what: "Leaders should assign work to teams whenever possible.",          why: "" },
      { key: "m2_promote_trust",     title: "Promote Trust Between Team Members",               what: "Trust creates cohesion.",                                         why: "" },
      { key: "m2_mutual_respect",    title: "Ensure Mutual Respect",                            what: "Respect allows teams to disagree without becoming divided.",      why: "Cohesion cannot develop without mutual respect." },
      { key: "m2_keep_informed",     title: "Keep the Team Informed",                           what: "Transparency reduces uncertainty and stress.",                    why: "Information builds trust and helps overcome resistance to change." },
      { key: "m2_mission_focus",     title: "Keep People Focused on the Mission During Adversity", what: "Mission provides purpose and direction.",                      why: "" },
      { key: "m2_setbacks",          title: "Talk About Setbacks",                              what: "Discussing setbacks creates learning opportunities.",             why: "" }
    ]
  },
  {
    num: 3,
    title: "Individual Purpose",
    url: "https://rblp.com/exam-prep-training/module-3-individual-purpose/",
    theme: "People give more when the work connects to a meaningful future — and when their leader clearly cares about them.",
    glossary: [
      ["Purpose", "The drive to achieve a meaningful future"],
      ["Character", "Mental and moral qualities of an individual"],
      ["Moral Courage", "Doing right despite personal risk"],
      ["Empathy", "Understanding what others are experiencing"],
      ["Growth Mindset", "Abilities improve through effort"],
      ["Self-Directed Learning", "Owning your own development"],
      ["Self-Efficacy", "Belief you can succeed at a task"],
      ["Responsibility", "Meaningful ownership of the work"],
      ["Empower", "Give authority to match responsibility"],
      ["Collective Efficacy", "The team's belief that it can succeed"]
    ],
    tasks: [
      { key: "m3_analyze_purpose",   title: "Analyze Individual Purpose",     what: "Purpose is the desire and determination to achieve a meaningful future.", why: "Purpose increases motivation, commitment, resilience, and adaptability." },
      { key: "m3_character",         title: "Demonstrate Character",          what: "Character is the mental and moral qualities of an individual.",           why: "" },
      { key: "m3_genuine_concern",   title: "Show Genuine Concern for People",what: "Getting to know people personally and professionally.",                   why: "People are more committed when they know their leader genuinely cares." },
      { key: "m3_individual_learning", title: "Encourage Individual Learning",what: "Developing knowledge and skills through continuous learning.",            why: "" },
      { key: "m3_delegate",          title: "Delegate Responsibility",        what: "Giving meaningful ownership of tasks and responsibilities.",              why: "Builds confidence, capability, and future leaders." },
      { key: "m3_empower",           title: "Empower Decision Making",        what: "Giving authority consistent with responsibility.",                       why: "Builds ownership and confidence." },
      { key: "m3_train",             title: "Train the Team",                 what: "Continuous development through on-the-job and formal training.",          why: "" }
    ]
  },
  {
    num: 4,
    title: "Team Learning",
    url: "https://rblp.com/exam-prep-training/module-4-team-learning/",
    theme: "Teams learn from experience: Experiencing → Reflecting → Deciding → Acting. Single-loop improves the process; double-loop changes the assumptions.",
    glossary: [
      ["Experiential Learning", "Experience → Reflect → Decide → Act"],
      ["Stretch Goals", "Ambitious goals that pull performance up"],
      ["Psychological Safety", "Safe to speak honestly without punishment"],
      ["Adaptive Thinking", "Recognizing change and adjusting quickly"],
      ["Mental Models", "“How we do things around here”"],
      ["Single-Loop Learning", "Improve the existing process"],
      ["Double-Loop Learning", "Question and change the assumptions"]
    ],
    tasks: [
      { key: "m4_analyze_learning",  title: "Analyze Team Learning Capacity", what: "Team learning is a continuous cycle of Experiencing → Reflecting → Deciding → Acting.", why: "Teams learn from experience to improve, innovate, and solve problems." },
      { key: "m4_collective_goals",  title: "Set Collective Goals for Teams", what: "Teams need clear goals and stretch goals.",                                          why: "" },
      { key: "m4_dialogue",          title: "Encourage Constructive Dialogue",what: "Honest, safe discussion that surfaces better answers.",                              why: "" },
      { key: "m4_mental_models",     title: "Build New Mental Models",        what: "Mental Models = “How we do things around here.”",                          why: "Teams must adapt mental models to improve and embrace change." }
    ]
  },
  {
    num: 5,
    title: "Organizational Learning",
    url: "https://rblp.com/exam-prep-training/module-5-organizational-learning/",
    theme: "Organizations that learn and change faster than their competition stay ahead. Vision aligns it; knowledge creation and sharing power it.",
    glossary: [
      ["Continuous Improvement", "Make what exists better"],
      ["Innovation", "Create something new"],
      ["Competitive Advantage", "Outperforming others over time"],
      ["Organizational Change", "Moving the whole organization to a new way"],
      ["Vision", "What the organization wants to become"],
      ["Culture", "The shared values that support or block change"],
      ["Strategy", "The roadmap to the vision"],
      ["Status Quo", "The current way — what change has to overcome"],
      ["Community of Practice", "A group that learns a craft together"]
    ],
    tasks: [
      { key: "m5_analyze_org",       title: "Analyze Organizational Learning Capacity", what: "Organizational learning is the ability to continuously improve and innovate to gain or maintain competitive advantage.", why: "Organizations that learn and change faster than others are more adaptive, resilient, and effective." },
      { key: "m5_shared_vision",     title: "Promote a Shared Vision",                  what: "Vision describes what the organization wants to become in the future.",                                                   why: "A clear vision aligns people and teams, drives learning, and creates motivation for change." },
      { key: "m5_knowledge_creation",title: "Foster Knowledge Creation",                what: "Knowledge creation is the continuous generation of new ideas that improve, innovate, or solve problems.",              why: "Frontline workers and supervisors often have the best ideas because they are closest to the work." },
      { key: "m5_knowledge_sharing", title: "Ensure Knowledge Sharing",                 what: "Knowledge sharing is the deliberate exchange of information, skills, experience, and insights.",                        why: "If new knowledge stays with one person or team, the organization cannot learn from it." }
    ]
  }
];

// Story prompts shown on every worksheet task.
export const STORY_SOURCES = ["family", "current job", "former job", "an association or volunteer role", "a time you led", "a time you followed"];

// Instructor reminders — P&L facilitation SOP, from the content pack.
export const FACILITATION = [
  "20% instructor talk / 80% participation. Discussion, not lecture.",
  "If discussion is flowing, don't call on people. If it's quiet, call to pull participation.",
  "Often don't read the canned questions — reading prompts people to recite prepared lines instead of thinking.",
  "Prefer one merged, applied question per section (e.g. “Talk about climate in a job you had and how it affected the team”).",
  "Phrase it as “do this even better” rather than “doing it better.”",
  "Budget ~75 minutes per module (60–90 is normal)."
];

export const SOP_CHECKLIST = [
  "Contact the student within 48 hours of enrollment",
  "Send the intro / welcome email",
  "Confirm attendance email before the session",
  "Deliver the cohort session (Teams)",
  "Issue the completion certificate",
  "Oral exam handoff — student notifies ATP, ATP notifies Brenda Risner",
  "Post-training email + request testimonial / review"
];

export function modulesForTrack(track) {
  return (TRACKS[track] || TRACKS.RBLP).modules;
}

export function tasksForTrack(track) {
  const nums = modulesForTrack(track);
  return MODULES.filter((m) => nums.includes(m.num)).flatMap((m) => m.tasks.map((t) => t.key));
}

export function allTaskKeys() {
  return MODULES.flatMap((m) => m.tasks.map((t) => t.key));
}

// ---------------------------------------------------------------- teaching guide
//
// Instructor-only. Never goes into the student payload — see /api/classroom/console.
//
// LICENCE: this is Tommy's own facilitation material — how he opens a task, a story out of
// his own career he can tell to model the answer, and the one applied question he throws to
// the room. It is deliberately NOT a restatement of the RBLP module. The module text lives on
// rblp.com; this is the coaching around it.
//
// Shape, per leader task:
//   open  — how to frame the task in a sentence, before any discussion
//   model — Tommy's own example, so the instructor hears what "in my experience…" sounds like
//           and can reach for their own instead of borrowing this one
//   ask   — ONE merged, applied question. Per the SOP we don't read the canned questions:
//           reading them makes people recite prepared lines instead of thinking.
export const MODULE_OPENINGS = {
  1: "Climate is what the team feels this week; culture is what the organization has believed for years. Get that split landed early — most of module 1 hangs off it.",
  2: "Cohesion is what's left when the work gets hard. Two strands run through every task: do they get along, and do they deliver together.",
  3: "This module moves from the team to the individual. The leader's job here is helping one person see why their work matters and where it's taking them.",
  4: "Teams learn in a loop — experience, reflect, decide, act. The tasks are about making that loop deliberate instead of accidental.",
  5: "Organizations don't learn; teams do, and then the organization keeps it. Everything here is about what happens to a lesson after one team learns it."
};

export const COACHING = {
  // ---- Module 1 — Team Climate
  m1_analyze_climate: {
    open: "Name the thing people feel but don't have a word for. Climate is the mood on the team right now; culture is what the organization has believed for twenty years.",
    model: "Tommy: the Army's culture didn't shift an inch, but one toxic supervisor took the climate of my shop down inside a month. Same values on the wall, completely different place to work.",
    ask: "Talk about the climate in a job you've had, and what it did to the way the team worked."
  },
  m1_earn_trust: {
    open: "Trust has two halves — can you do the job, and will you do the right thing. People need both before they hand you real effort.",
    model: "Tommy: as a Career Counselor, Soldiers had to believe I knew the regulation cold and that I wasn't going to shade it to make a retention number.",
    ask: "Think of a leader you'd work for again. Which half did they earn first — the competence or the integrity?"
  },
  m1_respect: {
    open: "Respect is about whether people get your attention, not whether you end up agreeing with them. That distinction comes up on the exam.",
    model: "Tommy: in career counseling I'd hear a Soldier's whole plan out before I said anything about what the Army needed. Half the time they talked themselves into the right answer.",
    ask: "Where have you had your opinion genuinely heard but not taken — and how did that compare to being talked over?"
  },
  m1_accountability: {
    open: "Firm, fair, consistent. Frame it as learning rather than punishment, and note that it builds trust because the standard holds for everybody.",
    model: "Tommy: the clearest lesson I have is the negative one — when that supervisor was never held to the same standard as the rest of us, the team quietly learned the standard was optional.",
    ask: "What happens to a team when the rules apply to most people but not all of them?"
  },
  m1_fun: {
    open: "Hard work and enjoying the work aren't opposites. The line to draw: humour that costs somebody their dignity isn't fun, it's disrespect wearing a joke.",
    model: "Tommy: the offices that hit their numbers were the ones where people wanted to be in the room. That's not soft — it's what kept people through long retention pushes.",
    ask: "What did a team you enjoyed being on actually do differently day to day?"
  },
  m1_adversity: {
    open: "Proactive coping — you tell people the hard part is coming before it arrives, so they meet it braced instead of ambushed.",
    model: "Tommy: retention missions shifted mid-year, every year. Teams that were told to expect it absorbed it in a day. Teams that got surprised lost a week to griping about it.",
    ask: "Talk about a setback you could see coming. Did anyone say so out loud, and what difference did that make?"
  },
  m1_be_there: {
    open: "Show up and stay involved without taking the task off them. Worth separating support from micromanagement — people confuse the two.",
    model: "Tommy: the leaders I remember in a crisis got quieter, not louder. The one who yelled and hung up on people trained us to stop bringing him problems early.",
    ask: "When something went badly wrong, what did your leader do that actually helped — or made it worse?"
  },

  // ---- Module 2 — Team Cohesion
  m2_analyze_cohesion: {
    open: "Two strands. Social cohesion is the relationships; task cohesion is pulling toward the same goal. In uniform the task side usually carries more weight, but the social side is what holds it up.",
    model: "Tommy: my RCCC team had the task side on paper — briefs, metrics, weekly meetings. What actually held it together was lunches and people covering each other's absences without being asked.",
    ask: "Think of the tightest team you've been on. Was it the relationships or the mission that kept it together?"
  },
  m2_organize_teams: {
    open: "Why a team beats the same people working alone: different angles on the problem. Shared leadership means whoever has the expertise leads that piece — the formal leader is still accountable for all of it.",
    model: "Tommy: I ran the meeting, but when it turned to education benefits the person who lived in those regulations ran that part. Nobody needed permission for that.",
    ask: "Where have you seen the person with the expertise step up and lead a piece of it — and where was that not allowed to happen?"
  },
  m2_promote_trust: {
    open: "Split it: social trust is do they mean well, task trust is will they deliver. Teams usually have one without the other, and the missing half is the problem.",
    model: "Tommy: I've had counselors I'd trust with anything personal who I still had to check behind on a deadline — and the reverse. Naming which one is missing is most of the fix.",
    ask: "Think of someone you've worked with. Did you trust their intentions, their delivery, or both — and how did you work around the gap?"
  },
  m2_mutual_respect: {
    open: "The leader's specific job here: address disrespect when the person on the receiving end can't defend themselves. Watch for interrupting, dismissiveness, sarcasm, and public correction.",
    model: "Tommy: the same supervisor from module 1 would cut people off in front of the room. Nobody outranked him enough to say it, so it stood — and everyone learned what was tolerated.",
    ask: "Who set the tone for how people spoke to each other on your team, and what happened when someone crossed the line?"
  },
  m2_keep_informed: {
    open: "Give them the three-question habit: What do I know? Who needs it? Have I told them? Then land the point — people handle bad news better than they handle not knowing.",
    model: "Tommy: weekly updates, even the weeks the news was bad. Silence in a retention shop just gets filled with rumour, and rumour is always worse than the facts.",
    ask: "Talk about a time you were left guessing at work. What did the silence cost?"
  },
  m2_mission_focus: {
    open: "Separate mission from vision — mission is what we're doing today, vision is where we're headed. Under adversity you strip distractions and reconnect the work to why it matters.",
    model: "Tommy: when the numbers slipped, the fix was cutting everything that wasn't the mission that month, not adding more meetings about the numbers.",
    ask: "When your team was under real pressure, what got dropped — and should it have been?"
  },
  m2_setbacks: {
    open: "The AAR pattern: what happened, why, what did we learn, what do we do differently. Make the point that this is learning, not a blame session — the moment it becomes blame, people stop telling you things.",
    model: "Tommy: we reviewed the months we missed the mission the same way we reviewed the ones we hit. That's what made people willing to bring me a problem while it was still small.",
    ask: "Talk about a mistake your team actually learned something from. What made that possible?"
  },

  // ---- Module 3 — Individual Purpose
  m3_analyze_purpose: {
    open: "Purpose is the determination to get to a meaningful future. Split growth two ways — personal (character, confidence) and professional (knowledge, skills, career).",
    model: "Tommy: my own list is the honest version of this — theology at Liberty, the MBA, MLC, the RBLP trainer path, then building Promote & Lead. Each one was me deciding where I was going next.",
    ask: "What are you working toward right now that has nothing to do with your current job description?"
  },
  m3_character: {
    open: "Character is the moral and mental qualities people come to expect from you — it's what builds your reputation. Moral courage, honesty, humility, empathy.",
    model: "Tommy: the hard counseling sessions were the ones where the honest answer cost me the easy retention. Those are the ones people remembered and came back for.",
    ask: "Talk about a time doing the right thing carried a real cost at work. What did it change?"
  },
  m3_genuine_concern: {
    open: "This is knowing people, personally and professionally — goals, strengths, what's in their way. Mentoring is the deliberate version of it.",
    model: "Tommy: career counseling meant knowing about the promotion, the retirement plan, the degree and the family situation. You can't give somebody a career answer without the rest of it.",
    ask: "Who at work actually knew what you were trying to build, and what difference did that make?"
  },
  m3_individual_learning: {
    open: "Learning sticks when it's applied straight away. Separate constructive feedback from criticism — one improves performance, the other just lands on the person.",
    model: "Tommy: I'd send a counselor to a class and put them on a real case that week. The ones who waited a month to use it had lost most of it.",
    ask: "What's something you were trained on and never used? What happened to it?"
  },
  m3_delegate: {
    open: "Delegation hands over the task and the ownership. The failure mode is obvious and common — handing it over and then hovering.",
    model: "Tommy: the first time I handed a DS brief to one of my counselors I rewrote half of it the night before. That taught them nothing and cost me an evening.",
    ask: "When something was delegated to you, was it actually yours? How could you tell?"
  },
  m3_empower: {
    open: "Empowerment is authority plus the means to act — responsibility without authority is a trap. Mistakes are the cost of people learning to decide.",
    model: "Tommy: I told my team to make the call with the information they had rather than waiting for me. Some of those were wrong. Waiting would have been worse.",
    ask: "Have you been held responsible for something you didn't have the authority to fix? How did that go?"
  },
  m3_train: {
    open: "On-the-job training does more than any course; formal training supplements it. Land collective efficacy here — the team's shared belief that it can do hard things because it has before.",
    model: "Tommy: after a couple of years of hitting hard missions, my team stopped asking whether we could do it. That belief was built out of the previous wins, not a briefing.",
    ask: "What's something your team believed it could do because of what it had already pulled off?"
  },

  // ---- Module 4 — Team Learning
  m4_analyze_learning: {
    open: "Walk the loop: experiencing, reflecting, deciding, acting, round again. The point most people miss — teams learn from routine work and successes, not just failures.",
    model: "Tommy: the Army AAR habit is the cleanest version of this I've seen. We ran it after the good months too, which is where most teams skip it.",
    ask: "Where does your team actually stop and reflect — and is it only after something goes wrong?"
  },
  m4_collective_goals: {
    open: "Stretch goals sit deliberately outside the comfort zone — that's what forces the improvement. Add unity of effort: same objective, not the same task.",
    model: "Tommy: retention targets were always set above comfortable. The teams that made them changed how they worked; the ones that just worked longer hours burned out.",
    ask: "Talk about a goal that was set high on purpose. Did it change how your team worked, or just how hard?"
  },
  m4_dialogue: {
    open: "Psychological safety underneath, constructive dialogue on top. Safe to admit a mistake, challenge an assumption, say the unpopular thing — built on trust and respect from modules 1 and 2.",
    model: "Tommy: I could tell which of my meetings were safe by who spoke second. If it was always the same person, people were reading the room instead of thinking.",
    ask: "On your team, could you say the unpopular thing out loud? What made that possible or not?"
  },
  m4_mental_models: {
    open: "Mental models are 'how we've always done this.' Single-loop learning improves the process; double-loop questions whether the process should exist. Resistance is usually attachment to the old model, not opposition to improvement.",
    model: "Tommy: we spent years making the counseling workflow faster — single loop. Rethinking what the workflow was for was a different and much harder conversation.",
    ask: "What's a 'that's just how we do it' at your work? Has anyone asked why lately?"
  },

  // ---- Module 5 — Organizational Learning
  m5_analyze_org: {
    open: "The key move: organizations don't learn directly — teams learn, and the organization keeps it. Separate continuous improvement (make the existing thing better) from innovation (make a new thing).",
    model: "Tommy: improving the retention workflow was continuous improvement. Building Promote & Lead as an authorized training partner was innovation — a different thing, not a better version of the old one.",
    ask: "Does a lesson your team learns actually survive past your team? Where does it go?"
  },
  m5_shared_vision: {
    open: "Vision is what the organization wants to become; mission is what it does today. Then the chain: vision shapes culture, culture shapes strategy, strategy drives learning and change.",
    model: "Tommy: the vision for P&L was the ATP model before any of it existed. Everything since has been strategy working back from that.",
    ask: "Can you say what your organization is trying to become, in a sentence? Could the person next to you?"
  },
  m5_knowledge_creation: {
    open: "The best ideas usually come from the people doing the work. The leader's job is developing half-formed ideas instead of dismissing them, and treating a challenge to the status quo as improvement rather than complaint.",
    model: "Tommy: the workflow fixes that mattered came from counselors at the desk, not from me. My job was not killing them in the first thirty seconds.",
    ask: "When did you last have an idea about your own job? Who did you tell, and what happened to it?"
  },
  m5_knowledge_sharing: {
    open: "Knowledge only becomes organizational once it's shared. Name the standard obstacle — 'that works over there, not here' — and land communities of practice as the fix.",
    model: "Tommy: the RCCC network, the SVA, the RBLP trainers, the ministry groups — same pattern every time. People doing the same work comparing notes is where the real learning moved.",
    ask: "Who outside your team does your job somewhere else — and when did you last compare notes with them?"
  }
};

// ---------------------------------------------------------------- study + teaching craft
//
// From the two internal build-out guides (Classroom resources/, 11 Sep 2026): the student
// Learning Guide and the instructor Teaching Guide. Both are P&L's own facilitation and study
// craft written to be built into this classroom — not RBLP module prose, which still lives on
// rblp.com behind the month password.

// Student-facing, per module: what "ready" looks like, and the near-neighbour pairs that trip
// candidates in the oral. Deliberately no answer key — these are prompts to self-test against.
export const MODULE_STUDY = {
  1: {
    success: "You can define climate vs culture, explain trust as competence + integrity, and tell a short story for each of the seven leader tasks in the three-bullet pattern.",
    good: "Crisp climate/culture split, a trust story showing both halves, and an accountability story that is firm, fair and consistent.",
    selfCheck: [
      "Can I explain climate vs culture in one sentence each?",
      "Can I define trust without just using the word trust?",
      "Do I have an accountability story that is firm, fair and consistent?",
      "Can I explain proactive coping with a real setback I prepared for?"
    ]
  },
  2: {
    success: "You can distinguish climate from cohesion, social from task cohesion and trust, explain shared leadership and AARs, and tell your own stories for all seven tasks.",
    good: "Clear social/task pairs, a transparency story, and a setback story that shows learning rather than blame.",
    selfCheck: [
      "Can I contrast climate and cohesion in one breath?",
      "Can I give an example of social cohesion and one of task cohesion?",
      "Can I explain shared leadership without saying “no boss”?",
      "Do I have a setback story that isn't a blame story?"
    ]
  },
  3: {
    success: "You can define purpose, character traits, growth mindset, and self- vs collective efficacy, and tell stories for delegation, empowerment, mentoring and training.",
    good: "A personal purpose story, a clear character example, and delegation/empowerment stories where authority actually matched responsibility.",
    selfCheck: [
      "Can I define purpose without reading it?",
      "Can I contrast self-efficacy and collective efficacy?",
      "Do I have a moral-courage or honesty story?",
      "Can I explain empowerment as authority + the means to act?"
    ]
  },
  4: {
    success: "You can run the experiential cycle aloud, define psychological safety and mental models, contrast single- vs double-loop with examples, and story all four leader tasks.",
    good: "Cycle stages in the right order, a stretch-goal example, a dialogue story tied to safety, and a mental-model change labelled single- or double-loop correctly.",
    selfCheck: [
      "Can I name Experiencing → Reflecting → Deciding → Acting in order?",
      "Can I give one single-loop and one double-loop example?",
      "Is my psychological-safety story about honesty without fear — not about avoiding hard feedback?",
      "Do I understand unity of effort — same objective, not necessarily the same task?"
    ]
  },
  5: {
    success: "You can explain how team learning becomes organizational learning, contrast continuous improvement with innovation, use vision/culture/strategy correctly, and story knowledge creation and sharing.",
    good: "An org-learning definition tied back to teams, a vision example, a frontline-idea story, and a community-of-practice story.",
    selfCheck: [
      "Can I say why organizations learn through teams?",
      "Can I contrast continuous improvement and innovation?",
      "Can I define vision, culture and strategy without mixing them up?",
      "Do I have a community-of-practice example from my own life?"
    ]
  }
};

// How the modules build. Students on the base track still benefit from knowing where it goes.
export const MODULE_ARC = [
  "Team Climate builds the trust and respect that make honest conversation possible.",
  "Team Cohesion keeps people united and sharing when things get hard.",
  "Individual Purpose fuels the motivation to grow and contribute.",
  "Team Learning turns experience into improvement through a repeatable cycle (Coach and Trainer).",
  "Organizational Learning spreads team lessons into vision, strategy and shared practice (Trainer)."
];

// How to study — the habits that separate a candidate who can apply the ideas from one who
// memorised them.
export const STUDY_HABITS = {
  terms: [
    "Build a one-page glossary per module — the term plus your own one-liner.",
    "Say the definitions out loud. If you only recognize them on the page, you're not ready.",
    "Give the confusable pairs extra attention; they're listed in each module's self-check."
  ],
  stories: [
    "A short, specific story beats a long lecture — RBLP is listening for application.",
    "Sources: family, current job, former job, an association. Leader or follower both count.",
    "Structure it: the situation → what you did or saw → what the concept explains.",
    "Don't reuse an instructor's example as your own. Examiners want your life."
  ],
  worksheets: [
    "Fill your worksheets before the live session wherever you can — come with drafts, not blank pages.",
    "The starter What/Why lines are only starters. Rewrite them in your voice.",
    "Right after class, expand the thin answers while the discussion is still fresh.",
    "Before exam day, print your glossary and your stories."
  ],
  live: [
    "Listen for the distinctions the instructor leans on — those are usually exam angles.",
    "Share your own examples. Participation is what builds fluency for the oral.",
    "Expect about 75 minutes a module inside your track's Saturday window."
  ]
};

// Exam mechanics, straight from rblp.com (verified 12 Sep 2026). Two traps worth knowing:
//   · An older policy page on resiliencebuildingleader.com still describes a different retake
//     rule (single-domain reexam at 30 days, 180-day wait for two+). It is OUT OF DATE. Use
//     rblp.com only — the current model is the 30-to-90-day second attempt below.
//   · Start times are narrow (09:00 or 11:00 local), which collides with a duty day.
export const EXAM_FACTS = {
  format: "A live oral exam over Microsoft Teams. No special software — but a computer or tablet, not a phone, in a private quiet room.",
  starts: "Exams start at 09:00 or 11:00 local time. If you have a duty day, plan leave now rather than the week before.",
  results: "Results are emailed on the third business day. You won't be told at the end.",
  scoring: "You have to meet the cut score in every domain, not on average — which is why a thin answer on one leader task matters.",
  // A $345 one-hour retake product exists. People do not pass first time sometimes, and saying
  // so plainly beats a student discovering it in a results email.
  retake: {
    lead: "If you don't pass, it isn't the end of it.",
    detail: "A second attempt is a one-hour exam covering what you missed, booked no sooner than 30 days and no later than 90 days after your first. RBLP charges for it. If that one doesn't go your way either, you can sit the full exam again after a year.",
    ours: "Tell us either way. We'll go back over the domains you missed with you before the retake — that's included."
  },
  fees: "Reschedule at least three days out. Inside that, RBLP charges a reschedule fee, and a no-show costs more again."
};

// The order matters. Booking before you're logged in causes checkout errors, and RBLP will not
// schedule an exam without your completion certificate uploaded.
export const EXAM_BOOKING = [
  { do: "Log in at rblp.com first", why: "Booking while logged out is a known cause of checkout errors." },
  { do: "Check your free application is on file", why: "RBLP will not schedule an exam without one." },
  { do: "Get your voucher or pay the exam fee", why: "CA, COOL and GI Bill each work differently — see your funding step." },
  { do: "Upload your Promote & Lead completion certificate", why: "This is a hard gate. No certificate, no exam date. Download it from your journey." },
  { do: "Watch RBLP's “What to expect” video and accept the policies", why: "Part of checkout." },
  { do: "Pick your slot — 09:00 or 11:00 local", why: "Those are the only start times." },
  { do: "Add to cart once, then wait", why: "The order takes several seconds to register. Clicking twice is a known way to double-book yourself." },
  { do: "Expect your calendar invite within three business days", why: "It isn't instant — don't panic on day one." }
];

export const EXAM_PREP = {
  // The last four come from what RBLP publish about their own exams and what certified
  // candidates say about sitting them — it's a live conversation over video with an examiner
  // who is explicitly trying to keep it relaxed, and they're assessing how you think and
  // communicate, not just what you can recall. Students arrive expecting an interrogation;
  // saying otherwise up front takes a lot of the fear out of it.
  mindset: [
    "You're showing how you lead or follow with these ideas — it isn't a trivia quiz.",
    "If you blank, go back to the three bullets: What, then Why, then your story.",
    "It's fine to pause and think. Clear and honest beats fast and fuzzy.",
    "Follower stories count. So do family and association stories.",
    "It's a conversation with a live examiner over video, not a written test. Candidates consistently describe the examiners as making it relaxed.",
    "If a question isn't clear, say so and ask them to put it another way. That's normal in an oral exam, and it's better than answering the wrong question.",
    "They're listening to how you think, communicate and work a problem — not only to what you can recall.",
    "This is why memorised lines don't survive: the questions move around, and your own stories are the only thing you can't be caught out on."
  ],
  checklist: [
    "Official modules reviewed for my track, using the month password.",
    "Glossary printed — every must-know term has my own one-liner.",
    "Every leader task has What / Why / Why-to-my-life / Story filled in.",
    "I can contrast the confusable pairs in my modules without notes.",
    "I've rehearsed out loud at least once per module.",
    "Exam scheduled with RBLP, and I've told Promote & Lead the date.",
    "Tech check: quiet private room, computer or tablet rather than a phone, charger, water.",
    "Rest. The confidence comes from stories you already lived."
  ],
  // RBLP sets exam-day rules; don't state what a candidate may have in front of them.
  note: "Follow RBLP's current exam rules on what you may have with you during the oral."
};

// Instructor-only teaching craft, per module.
export const MODULE_TEACHING = {
  1: {
    sequence: [["0–5", "Open: climate vs culture hook, and the session outcomes"],
               ["5–30", "Tasks 1–4 — climate, trust, respect, accountability"],
               ["30–45", "Tasks 5–7 — fun, adversity, being there"],
               ["45–55", "Story practice and worksheet polish"],
               ["55–60", "Close: three-bullet reminder, preview cohesion"]],
    civilian: [
      "A new manager who micromanages — a fear climate inside a strong company culture.",
      "A team that trusts a competent, honest lead and runs hard for them.",
      "Equal access to stretch projects, versus the favourites getting all the visibility.",
      "Team lunches and recognition that don't quietly exclude people.",
      "Pre-briefing a known busy season so nobody is blindsided."
    ],
    misses: [
      "Treating climate and culture as synonyms.",
      "Defining trust as just being nice — missing competence + integrity.",
      "Thinking valuing an opinion means agreeing with it.",
      "Treating accountability as punishment first.",
      "Saying fun has no place in serious work.",
      "Equating being there with micromanaging."
    ],
    angles: ["Climate vs culture", "How leaders earn trust", "Active listening", "Why accountability matters", "Why manage adversity expectations", "Being there without micromanaging"]
  },
  2: {
    sequence: [["0–5", "Open: bridge from climate, and where cohesion differs"],
               ["5–30", "Tasks 1–4 — cohesion, teams, trust, respect"],
               ["30–45", "Tasks 5–7 — informed, mission focus, setbacks"],
               ["45–55", "Story practice and worksheet polish"],
               ["55–60", "Close: three-bullet reminder, preview purpose"]],
    civilian: [
      "A project team that stays united through a deadline hit.",
      "Letting the subject-matter expert run a workstream while you stay accountable.",
      "An all-hands when bad news lands early, versus the rumour mill.",
      "A blameless postmortem after a failed launch.",
      "Prioritising the why when priorities stack up."
    ],
    misses: [
      "Treating cohesion as the same thing as climate.",
      "Describing only social cohesion and forgetting task cohesion, or the reverse.",
      "Thinking shared leadership means nobody is accountable.",
      "Confusing social trust with task trust.",
      "Equating transparency with oversharing everything.",
      "Turning setback conversations into blame sessions."
    ],
    angles: ["Climate vs cohesion", "Social vs task cohesion", "Shared leadership", "Social vs task trust in your profession", "Transparency and cohesion", "Rebuilding cohesion after adversity", "Why AARs matter"]
  },
  3: {
    sequence: [["0–5", "Open: the shift from team to individual"],
               ["5–30", "Tasks 1–4 — purpose, character, concern, learning"],
               ["30–45", "Tasks 5–7 — delegate, empower, train"],
               ["45–55", "Story practice and worksheet polish"],
               ["55–60", "Close: three-bullet reminder, preview team learning"]],
    civilian: [
      "Connecting a junior employee's stretch project to the career they actually want.",
      "Speaking up when a decision is wrong for the customer or the team.",
      "Weekly 1:1s that ask about goals, not only tasks.",
      "Delegating a client briefing and coaching after it, not during it.",
      "A team that believes “we've done hard things before”."
    ],
    misses: [
      "Defining purpose as only the company mission statement.",
      "Confusing self-efficacy with collective efficacy.",
      "Treating character as charisma.",
      "Delegating the task but not the authority, or the reverse.",
      "Feedback that criticises without improving performance.",
      "Treating training as formal classes only — missing OJT and mentoring."
    ],
    angles: ["What is individual purpose?", "Why purpose improves motivation", "Self-efficacy vs collective efficacy", "Why character matters", "Growth mindset", "Why mentoring matters", "Why people leave organizations they like", "Delegation and future leaders", "Empowering decision-making", "Training and resilience"]
  },
  4: {
    sequence: [["0–5", "Open: the experiential cycle end to end"],
               ["5–25", "Learning capacity and collective goals"],
               ["25–40", "Constructive dialogue and psychological safety"],
               ["40–55", "Mental models, single- vs double-loop"],
               ["55–60", "Close: three-bullet reminder, preview org learning"]],
    civilian: [
      "Sprint retros that actually change the next sprint — the full cycle.",
      "A stretch OKR that forces a new process rather than more hours.",
      "A meeting where people can challenge an assumption without career fear.",
      "Changing how onboarding works after evidence it fails new hires."
    ],
    misses: [
      "Stopping at experiencing — never reflecting or deciding.",
      "Confusing single-loop with double-loop.",
      "Defining psychological safety as being nice, or as no accountability.",
      "Treating stretch goals as unrealistic busywork.",
      "Winning arguments instead of holding constructive dialogue."
    ],
    angles: ["The four stages of experiential learning", "What blocks reflecting", "Analysis paralysis", "Why stretch goals", "Psychological safety", "Mental models", "Single- vs double-loop", "Why people resist change", "Team learning and resilience"]
  },
  5: {
    sequence: [["0–5", "Open: team learning to org learning, competitive advantage"],
               ["5–25", "Org learning capacity — improvement, innovation, change"],
               ["25–40", "Vision, culture, strategy and how they relate"],
               ["40–55", "Knowledge creation, sharing, communities of practice"],
               ["55–60", "Close: the full 1–5 arc and Trainer exam mindset"]],
    civilian: [
      "A local process win turned into a company playbook.",
      "A shared vision that aligns cross-functional teams.",
      "An idea from the warehouse or the help desk that leadership develops.",
      "An internal guild or community of practice spreading best practice.",
      "Competitive advantage as speed of adaptation, not only margin."
    ],
    misses: [
      "Saying the organization learns without naming teams as the foundation.",
      "Mixing up continuous improvement and innovation.",
      "Treating competitive advantage as only a business or profit term.",
      "Confusing vision, culture and strategy.",
      "Knowledge creation with no knowledge sharing — ideas stay trapped.",
      "Hearing a challenge to the status quo as a personal attack."
    ],
    angles: ["What is organizational learning?", "Why team learning is the foundation", "Continuous improvement vs innovation", "Competitive advantage across sectors", "Why change needs learning", "Vision vs culture vs strategy", "How shared vision drives change", "Why frontline ideas matter", "Challenging the status quo without needless conflict", "Communities of practice", "What blocks knowledge sharing"]
  }
};

// The SOP's standard shape. Note this is the ~75 minutes of material you PREPARE; the day
// itself gives 60 minutes of clock per module (see RUN_OF_DAY). The extra is depth to spend
// where the discussion actually goes, not slides to rush.
export const SESSION_RHYTHM = [
  ["Open", "0–5", "Hook and outcome; bridge from the last module; set norms"],
  ["Teach", "5–40", "Concept frames and key terms — short teach, then talk"],
  ["Story", "40–55", "Applied question; student stories; coach the distinctions"],
  ["Practice", "55–70", "Worksheet polish; three-bullet rehearsal on the weak tasks"],
  ["Close", "70–75", "Exam angles; preview the next module; admin notes"]
];

export const FACILITATION_CARDS = [
  "“Talk about a time when…” — merge the canned questions into one.",
  "“How would you do this even better?”",
  "Leader or follower — either story works.",
  "Valuing an opinion is not the same as agreeing with it.",
  "People handle bad news better than uncertainty.",
  "Setbacks are for learning, not blame."
];

// Mixed cohorts need both registers. Military students tend to reach for task cohesion and
// task trust; civilians tend to reach for the social side. Push each toward the other.
export const MIXED_COHORT_NOTE =
  "Military students usually lead with task cohesion and task trust — help them name the social side. " +
  "Civilian students usually lead with the social side — help them name task cohesion and mission focus. " +
  "Follower stories are valid and often the most powerful.";

// ---------------------------------------------------------------- run of day
//
// ONE cohort, ONE day, planned for Trainers. A cohort is mixed — say two Ps, two Cs and a T —
// and everyone learns together from 09:00. Students leave as their credential completes:
// Ps after module 3, Cs after module 4, Ts stay to the end. There is no separate RBLP day and
// no separate Coach day; there is the Trainer day, and people peel off it.
//
// The budget works out exactly. 09:00–15:30 is 390 minutes; five modules at 60 is 300 taught,
// leaving 90 for breaks — 15 + 60 lunch + 15, which is what Tommy asked for.
//
//   track    taught   finishes   published window
//   RBLP      3h      12:15      09:00–12:30
//   RBLP-C    4h      14:15      09:00–14:30
//   RBLP-T    5h      15:30      09:00–15:30
//
// Every track gets exactly its paybackHours and finishes at or before its published window.
//
// The breaks are placed so that the departures land ON them: a P's last module ends as lunch
// starts, and a C's last module ends as the afternoon break starts. Nobody packs up and walks
// out in the middle of a session. That is the constraint to preserve if these ever move —
// the tests below enforce it.
export const COHORT_DAY = [
  { at: "09:00", minutes: 60, kind: "module", module: 1 },
  { at: "10:00", minutes: 60, kind: "module", module: 2 },
  { at: "11:00", minutes: 15, kind: "break", label: "Morning break" },
  { at: "11:15", minutes: 60, kind: "module", module: 3, finishes: "RBLP" },
  { at: "12:15", minutes: 60, kind: "lunch", label: "Lunch" },
  { at: "13:15", minutes: 60, kind: "module", module: 4, finishes: "RBLP-C" },
  { at: "14:15", minutes: 15, kind: "break", label: "Afternoon break" },
  { at: "14:30", minutes: 60, kind: "module", module: 5, finishes: "RBLP-T" }
];

export const DAY_NOTES = {
  shape: "One day, planned for the Trainer track. Everyone starts at 09:00 and learns together; students leave as their credential completes.",
  breaks: "Morning break after Cohesion — the turn from the team to the individual. Lunch after Purpose — the end of the RBLP core, so the afternoon is Coach and Trainer material. Afternoon break after Team Learning — the turn from the team to the organization.",
  departures: "Each break is also a departure point. RBLP students finish as lunch begins; Coach students finish as the afternoon break begins. Nobody leaves mid-module.",
  instructor: "After lunch the room shrinks. Expect a smaller, more senior group for modules 4 and 5 — lean harder on discussion and let them carry more of it."
};

// "09:00" + 60 → "10:00". Wall clock in the cohort's timezone (America/Chicago).
export function addMinutes(at, minutes) {
  const [h, m] = at.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return String(Math.floor(t / 60) % 24).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}

// The whole cohort day, annotated for one student's track: `mine` is everything up to and
// including their last module, `finish` marks the block they finish on. A student sees the
// full day — the part after they leave is shown greyed, not hidden, so they understand the
// room keeps going and why their neighbour is staying.
export function runOfDay(track) {
  const t = TRACKS[track] ? track : "RBLP-T";
  const lastModule = TRACKS[t].modules[TRACKS[t].modules.length - 1];
  return COHORT_DAY.map((b) => {
    const mod = b.kind === "module" ? MODULES.find((m) => m.num === b.module) : null;
    // A break is "mine" only if I'm still in the room after it — i.e. more of my day follows.
    const mine = b.kind === "module" ? b.module <= lastModule : b.at < lastModuleStart(lastModule);
    return {
      ...b,
      until: addMinutes(b.at, b.minutes),
      label: b.label || (mod ? `Module ${mod.num} — ${mod.title}` : ""),
      mine,
      finish: b.kind === "module" && b.module === lastModule
    };
  });
}

function lastModuleStart(num) {
  const b = COHORT_DAY.find((x) => x.kind === "module" && x.module === num);
  return b ? b.at : "23:59";
}

// When a given track's day actually starts and ends, and how long they're taught.
export function dayFor(track) {
  const blocks = runOfDay(track).filter((b) => b.mine);
  const modules = blocks.filter((b) => b.kind === "module");
  const end = blocks[blocks.length - 1];
  return {
    start: COHORT_DAY[0].at,
    end: addMinutes(end.at, end.minutes),
    taughtMinutes: modules.reduce((a, b) => a + b.minutes, 0),
    window: TRACKS[TRACKS[track] ? track : "RBLP-T"].window
  };
}

// ---------------------------------------------------------------- instructor pay
//
// Shown in the instructor console. Instructors are contractors running a cohort for us, and the
// most common question is "when do I get paid" — answering it up front beats answering it by
// email five times. The chain is real and worth stating plainly: nothing is invoiced until the
// class is complete and the certificates are with RBLP.
export const INSTRUCTOR_PAY = {
  basis: "You're paid per student in your class, and the rate depends on how each of them is funded — Credentialing Assistance seats and self-funded seats are not worth the same.",
  chain: [
    "Run the class and mark who attended.",
    "Complete the class — that issues every attendee's training certificate.",
    "We send the certificates to RBLP. That's what triggers our invoice.",
    "RBLP pays us, typically a week or two after the certificates land.",
    "We pay you to your chosen payment method once those funds are in."
  ],
  note: "So payment always comes after the class, not on the day — there's nothing to invoice until the certificates are with RBLP.",
  ask: "Payment method or rate question? Email info@promoteandlead.com."
};

// ---------------------------------------------------------------- why the prep work matters
//
// We can't make anyone do the prep, so the job is to make the consequence obvious. The chain is
// real and students don't see it until afterwards: the hours you reflect become the material you
// expand in the cohort, and the cohort is what makes the exam survivable.
//
// The exam framing matters just as much. People arrive expecting an essay or a box-ticking test
// and prepare accordingly — memorising definitions — which is the one strategy the format is
// built to defeat.
export const WHY_PREP = {
  headline: "You get out what you put in",
  chain: [
    { at: "Prep work", says: "RBLP expects hours of personal reflection on your own leader and follower experience before the course. This is where those hours go — one honest answer and one real story per leader task." },
    { at: "The live session", says: "We expand what you've already written. Come with drafts and you spend the day deepening them and hearing other people's. Come with blank pages and you spend it catching up on reading you could have done at home." },
    { at: "The exam", says: "Every answer already in your own words is one you don't have to invent while someone is questioning you. This is where the prep either shows or doesn't." }
  ],
  // Deliberately not naming a specific qualification: RBLP describe their examiners publicly as
  // "experienced examiners". If we can confirm they all hold doctorates, say so here.
  examTruth: {
    isNot: "It isn't an essay, and it isn't multiple choice or ticking boxes.",
    is: "It's a live conversation with a subject-matter expert whose job is to work out whether you genuinely understand each competency.",
    how: "They'll move between topics, follow up on your answers, and ask you to apply the idea rather than define it. Memorised lines come apart under that. Your own experience doesn't.",
    so: "That's why we ask for your story on every leader task, in your words — it's the only preparation the format can't take apart."
  }
};

// ---------------------------------------------------------------- CA packet warnings
//
// Every line here exists because RBLP or the Army publish a "don't do X" about it — which is
// evidence X happens and bounces packets. Shown on the CA upload step.
// Army and Air Force are NOT the same rule set, and pasting Army's rank language onto an
// Air Force student is worse than saying nothing.
//
//   Army CA (AR 621-5, 19 Mar 2026): commissioned O1–O10 cut from new goals; warrant officers
//     W1–W5 and all enlisted stay eligible; officers with a goal opened before that date may
//     finish that one. Supervisor/commander approval now required at every rank.
//   AF COOL/CA: already a Total Force ENLISTED program — commissioned, separated and retired
//     are ineligible, and that isn't a 2026 "officer cut" to announce. Leadership credentials
//     skew SNCO E7–E9. The Air Force's 2024 warrant officer return is tiny and cyber/IT only,
//     so it is not a meaningful parallel to Army warrants; don't imply it is.
const CA_WARNINGS_SHARED = [
  { rule: "Two requests, one after the other", detail: "The training and the exam are funded as separate goals. You can't open both at once and you can't combine them — the exam request comes after the training is finished. Budget for a gap of months, not days." },
  { rule: "The vendor name has to match exactly", detail: "On the training request the company is RLS — spelled the way it appears in your portal. A quote in a different name is the most common bounce." },
  { rule: "Don't pay out of pocket to hold a seat", detail: "Credentialing Assistance will not reimburse you afterwards. If you've paid to reserve a place, tell us before you file." },
  { rule: "Don't start the class before it's funded", detail: "Attending before approval can cost you the funding entirely." },
  { rule: "Allow the full window", detail: "Requests take time to clear, and that's the clock we use to pick your cohort. Funding is subject to availability even once you're eligible." }
];

const CA_WARNINGS_ARMY = [
  { rule: "You must sit the exam, or repay the training", detail: "CA funds the course on the condition you take the credential exam. Don't sit it and the Army recoups what it paid for your training. Two recoupments across TA and CA in the same fiscal year suspends you from both for 12 months." },
  { rule: "180 days to open the exam request", detail: "Once you pass the course, the clock starts when your grade posts — you have 180 days from that date to submit the exam funding request. Miss it and you're paying for the exam yourself." },
  { rule: "One credential a fiscal year", detail: "CA is capped at one credential per fiscal year, and the course and exam together count as that one credential. Worth knowing before you plan a second." },
  { rule: "The company field is a search box, not a dropdown", detail: "Nothing on screen says so. The list is alphabetical and only loads the first stretch of partners, so scrolling never reaches RLS. Click into the field and start typing R-L-S, and Resilient Leadership Solutions appears. This is the step people give up on, assuming we aren't an approved vendor." },
  { rule: "Commissioned officers are no longer eligible", detail: "As of 19 March 2026, O1–O10 can't open new Army CA goals. Warrant officers W1–W5 and all enlisted Soldiers still can. If you had a credential goal open before that date you may be able to finish that one — ask your education center." },
  { rule: "Line up your supervisor first", detail: "Since 19 March 2026 every Army CA request needs supervisor approval, whatever your rank. In practice that's your first-line leader — it does not have to go to your commander. Tell them it's coming. First-time users also have ArmyIgnitED training and a MilGears plan to finish, so start those now rather than the week you file." },
  { rule: "Plan on 45 to 90 days", detail: "That's the window from submitting in ArmyIgnitED to a decision, and it decides which cohort you can realistically join." }
];

const CA_WARNINGS_AF = [
  { rule: "AF COOL is an enlisted program", detail: "Total Force enlisted. Commissioned officers, and anyone separated or retired, aren't eligible — the leadership credentials in particular are aimed at SNCOs, E7–E9." },
  { rule: "Check your timeline with your education office", detail: "Air Force processing differs from the Army's, so confirm the lead time before you count on a particular cohort date." }
];

export function caWarningsFor(paymentSource) {
  if (paymentSource === "army_ca") return [...CA_WARNINGS_ARMY, ...CA_WARNINGS_SHARED];
  if (paymentSource === "af_ca") return [...CA_WARNINGS_AF, ...CA_WARNINGS_SHARED];
  return null;
}

// ---------------------------------------------------------------- mock examiner
//
// The single biggest thing an instructor can do for exam readiness: stop accepting the first
// answer. The oral moves around and follows up; a student who has only ever said their answer
// once, unchallenged, meets that for the first time in the exam.
export const MOCK_EXAMINER = {
  why: "The exam follows up. It asks for a different example, or points out that what you described isn't the thing you were asked about. Students who've only said their answer once, unchallenged, meet that for the first time under exam pressure. Push on a few answers every module.",
  prompts: [
    "“Give me a different example — one from outside work.”",
    "“That's climate you're describing, not cohesion. Try again.”",
    "“You told me what it is. Tell me why it mattered to that team.”",
    "“What would a leader have done wrong in that situation?”",
    "“If you ran that team tomorrow, what would you do differently?”",
    "“Can you say that in one sentence?”"
  ],
  anxiety: "Say this out loud early: an oral exam feels like an interview, and introverts do fine — as long as the stories are written down first. Nobody here is going to let you wing it, and that's the point."
};

// RBLP's own support line, from rblp.com/home/about-us/contact (checked 12 Sep 2026). Kept in
// one place so it can't drift out of date in three different bits of copy.
//
// Where something is RBLP's to fix — invoices, exam scheduling, the credential itself — send
// the student straight to them. We're a hop in the middle, and routing through us adds a day
// for no benefit. We still want telling, so it shows up on the stalled list.
export const RBLP_SUPPORT = {
  email: "support@rblp.com",
  phone: "(213) 205-6100",
  hours: "Mon–Fri, 8:30am–4:30pm Mountain",
  expect: "They ask for 1–2 business days to reply."
};

// A cohort day is always the same shape, so nobody should be typing start and end times into a
// form — pick the Saturday and the rest follows. Cohorts run in America/Chicago whatever
// timezone the person setting them up happens to be in, so the offset is resolved against that
// zone rather than the admin's browser (which is how a cohort ends up an hour out).
export function chicagoInstant(dateStr, hhmm) {
  const naive = new Date(`${dateStr}T${hhmm}:00Z`);
  if (isNaN(naive)) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).formatToParts(naive).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  const asChicago = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return new Date(naive.getTime() - (asChicago - naive.getTime())).toISOString();
}

// The standard Saturday for a cohort, derived from COHORT_DAY rather than retyped.
export function standardSession(dateStr) {
  const first = COHORT_DAY[0];
  const last = COHORT_DAY[COHORT_DAY.length - 1];
  const end = addMinutes(last.at, last.minutes);
  const taught = COHORT_DAY.filter((b) => b.kind === "module").reduce((a, b) => a + b.minutes, 0);
  return {
    label: "Saturday session",
    starts_at: chicagoInstant(dateStr, first.at),
    ends_at: chicagoInstant(dateStr, end),
    instructional_minutes: taught,
    window: `${first.at}–${end} Central`
  };
}

// ---------------------------------------------------------------- after you file
//
// The gap between filing a CA request and the money moving is the longest dead stretch in the
// whole journey, and a student sitting in it has no idea whether anything is happening. Worse,
// "approved" and "funded" are different events weeks apart — people see approval, assume they
// can start, and are then told they're not funded.
//
// The two-and-a-half week figure is observed, not published: one of our own students, from
// ACAPO approval to funding actually landing.
export const CA_STAGES = [
  { stage: "Your supervisor approves it", who: "First-line leader",
    note: "This is the step that most often stalls, and it's the one you can do something about. A nudge in person beats waiting." },
  { stage: "ACAPO reviews it", who: "Army CA Program Office",
    note: "The Army's credentialing assistance office checks the request itself. Nothing for you to do here." },
  { stage: "Funding is released", who: "Army finance",
    note: "This is the slow part, and it happens AFTER approval — one of our students waited about two and a half weeks between the two. Approved does not yet mean funded, and you shouldn't start the course until it is." },
  { stage: "RBLP tells us it's funded", who: "RBLP",
    note: "We open your prep work the moment that lands, and email you." }
];

// ---------------------------------------------------------------- picking a course date
//
// The CA form demands a course start date, and the student cannot know theirs — they aren't
// placed in a cohort until the funding lands. The portal also refuses anything sooner than the
// lead time. So they sit stuck on a field they have no answer for.
//
// The answer is that the date is a placeholder: pick any Saturday inside the allowed window so
// the request can be filed. It doesn't bind them to that date, and it isn't their cohort.
export const CA_WINDOW = { minDays: 45, maxDays: 90 };

export function eligibleCourseDates(today) {
  const from = today ? new Date(today + "T12:00:00Z") : new Date();
  const day = (n) => {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  const earliest = day(CA_WINDOW.minDays);
  const latest = day(CA_WINDOW.maxDays);

  const saturdays = [];
  for (let d = new Date(earliest.getTime()); d <= latest; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 6) saturdays.push(d.toISOString().slice(0, 10));
  }
  return {
    earliest: earliest.toISOString().slice(0, 10),
    latest: latest.toISOString().slice(0, 10),
    saturdays,
    // The first couple are only safe if the office counts calendar days; flag them.
    tightUntil: day(Math.round(CA_WINDOW.minDays * 1.45)).toISOString().slice(0, 10)
  };
}

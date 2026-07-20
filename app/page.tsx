"use client";

import { ChangeEvent, useMemo, useState } from "react";

type ProjectSettings = {
  title: string;
  protagonist: string;
  goalAmount: number;
  triggerFlag: string;
  canonNote: string;
};

type AnalysisKind = "reachability" | "identity" | "relation" | "blast-radius" | "general";

type Inquiry = {
  question: string;
  status: string;
  headline: string;
};

const DEFAULT_SETTINGS: ProjectSettings = {
  title: "Vibe Coder Simulator",
  protagonist: "USER_0047",
  goalAmount: 47000,
  triggerFlag: "grandma-surgery-funded",
  canonNote:
    "Grandma's deteriorating eyesight gives the Founder a concrete obligation: pay for a $47,000 sight-restoring operation without abandoning the company journey.",
};

const BASE_SOURCES = [
  { id: "DOC-01", name: "Narrative Contract", detail: "Goal, stakes, and ending promise", color: "cyan" },
  { id: "SYS-02", name: "Economy Table", detail: "Cash, revenue, and investment gates", color: "violet" },
  { id: "CODE-07", name: "Story Triggers", detail: "Runtime conditions and flags", color: "orange" },
  { id: "ART-27", name: "Grandma Asset Record", detail: "Identity and visual states", color: "rose" },
];

const Icon = ({ name, size = 18 }: { name: string; size?: number }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "spark") return <svg {...common}><path d="m12 3-1.2 5.3L6 10l4.8 1.7L12 17l1.2-5.3L18 10l-4.8-1.7L12 3Z"/><path d="m5 16-.6 2.2L2 19l2.4.8L5 22l.6-2.2L8 19l-2.4-.8L5 16Z"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
  if (name === "edit") return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>;
  if (name === "upload") return <svg {...common}><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === "x") return <svg {...common}><path d="M18 6 6 18M6 6l12 12"/></svg>;
  if (name === "link") return <svg {...common}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>;
  if (name === "download") return <svg {...common}><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></svg>;
  if (name === "layers") return <svg {...common}><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>;
};

function classifyQuestion(question: string): AnalysisKind {
  const q = question.toLowerCase();
  if (q.includes("who is") || q.includes("tell me about")) return "identity";
  if (q.includes("which grandma") || q.includes("related") || q.includes("user_0047")) return "relation";
  if (q.includes("60,000") || q.includes("60000") || q.includes("what breaks") || q.includes("change")) return "blast-radius";
  if (q.includes("fund") || q.includes("operation") || q.includes("surgery") || q.includes("reachable")) return "reachability";
  return "general";
}

export default function Home() {
  const [settings, setSettings] = useState<ProjectSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const saved = window.localStorage.getItem("continuity-lab-project");
      return saved ? JSON.parse(saved) as ProjectSettings : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [draft, setDraft] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [question, setQuestion] = useState("Can the current game actually fund Grandma's $47,000 operation?");
  const [analyzedQuestion, setAnalyzedQuestion] = useState(question);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [activeTab, setActiveTab] = useState("diagnosis");
  const [candidateStatus, setCandidateStatus] = useState<"review" | "approved" | "revision">("review");
  const [localSources, setLocalSources] = useState<{ id: string; name: string; detail: string; color: string }[]>([]);
  const [toast, setToast] = useState("");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);

  const kind = useMemo(() => classifyQuestion(analyzedQuestion), [analyzedQuestion]);
  const money = useMemo(() => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(settings.goalAmount), [settings.goalAmount]);
  const allSources = [...BASE_SOURCES, ...localSources];

  function analyze(nextQuestion?: string) {
    const value = nextQuestion ?? question;
    if (nextQuestion) setQuestion(nextQuestion);
    setIsAnalyzing(true);
    window.setTimeout(() => {
      const result = getAnswer(classifyQuestion(value), settings, money);
      setAnalyzedQuestion(value);
      setInquiries((current) => [...current.filter((item) => item.question !== value), { question: value, status: result.status, headline: result.headline }].slice(-4));
      setIsAnalyzing(false);
      document.getElementById("analysis")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 520);
  }

  function saveProject() {
    setSettings(draft);
    window.localStorage.setItem("continuity-lab-project", JSON.stringify(draft));
    setShowEditor(false);
    showToast("Project changes saved in this browser");
  }

  function resetProject() {
    setDraft(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    window.localStorage.removeItem("continuity-lab-project");
    setShowEditor(false);
    showToast("Demo project restored");
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function exportProject() {
    const blob = new Blob([JSON.stringify({ project: settings, sources: allSources }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "continuity-lab-project.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Project packet exported");
  }

  function addSource(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const size = typeof reader.result === "string" ? reader.result.length : file.size;
      setLocalSources((current) => [...current, { id: `LOCAL-${current.length + 1}`, name: file.name, detail: `${Math.max(1, Math.round(size / 1000))}k characters · local session`, color: "green" }]);
      showToast(`${file.name} added to this local session`);
    };
    reader.readAsText(file);
  }

  const answer = getAnswer(kind, settings, money);

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="Continuity Lab home">
          <span className="brand-mark"><Icon name="spark" size={20}/></span>
          <span>Continuity <i>Lab</i></span>
        </a>
        <div className="nav-context">
          <span className="project-dot" />
          <span className="nav-project">{settings.title}</span>
          <span className="source-count">{allSources.length} sources</span>
        </div>
        <div className="nav-actions">
          <button className="button ghost compact" onClick={exportProject}><Icon name="download" size={16}/> Export</button>
          <button className="button light compact" onClick={() => { setDraft(settings); setShowEditor(true); }}><Icon name="edit" size={16}/> Edit project</button>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-art" aria-hidden="true" />
        <div className="hero-wash" />
        <div className="hero-orb orb-one" />
        <div className="hero-orb orb-two" />
        <div className="hero-inner">
          <div className="eyebrow"><span>●</span> STORY INTELLIGENCE FOR GAME TEAMS</div>
          <h1>Build forward.<br/><em>Without story drift.</em></h1>
          <p className="hero-copy">Bring the project once. Then ask whether characters, events, economics, code, and art still agree—and what must happen next.</p>

          <div className="question-card">
            <div className="question-label"><Icon name="spark" size={16}/> Ask across every source in the project</div>
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Question about project canon" />
            <div className="question-footer">
              <div className="question-meta"><span className="pulse-dot"/> GPT-5.6 architecture · demo evaluator active</div>
              <button className="button primary" onClick={() => analyze()} disabled={isAnalyzing || !question.trim()}>
                {isAnalyzing ? <span className="spinner"/> : <Icon name="arrow" size={18}/>} {isAnalyzing ? "Tracing…" : "Trace consequences"}
              </button>
            </div>
          </div>

          <div className="prompt-row">
            <span>Try</span>
            {["Who is Grandma?", `Is she ${settings.protagonist}'s grandmother?`, "What breaks if surgery costs $60,000?"].map((prompt) => (
              <button key={prompt} onClick={() => analyze(prompt)}>{prompt}</button>
            ))}
          </div>
        </div>
        <div className="hero-person" aria-hidden="true"><img src="/art/vcs-founder-canonical.png" alt="" /></div>
      </section>

      <section className="analysis-section" id="analysis">
        <div className="section-heading">
          <div><div className="eyebrow dark">LIVE PROJECT TRACE</div><h2>{analyzedQuestion}</h2></div>
          <span className={`verdict ${answer.tone}`}><span/>{answer.status}</span>
        </div>

        <div className="inquiry-trail">
          <div className="trail-intro"><span className="trail-oracle"><img src="/art/vcs-oracle.png" alt=""/></span><div><small>PROJECT INQUIRY</small><strong>Ask follow-ups without losing the evidence trail.</strong></div></div>
          <div className="trail-items">
            {(inquiries.length ? inquiries : [{ question: analyzedQuestion, status: answer.status, headline: answer.headline }]).map((item, index) => (
              <button className={item.question === analyzedQuestion ? "active" : ""} key={`${item.question}-${index}`} onClick={() => analyze(item.question)}>
                <span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.question}</strong><small>{item.status} · {item.headline}</small></div>
              </button>
            ))}
          </div>
        </div>

        <div className="analysis-grid">
          <article className="result-card main-result">
            <div className="result-kicker"><Icon name="layers" size={17}/> CONCLUSION</div>
            <h3>{answer.headline}</h3>
            <p className="result-summary">{answer.summary}</p>
            <div className="evidence-strip">
              <span>Supported by</span>
              {answer.evidence.map((item) => <button key={item}>{item}</button>)}
            </div>
          </article>

          <article className="result-card character-result">
            <div className="portrait-ring"><img src="/art/vcs-grandma-preop.png" alt="Grandma, an older woman in a terracotta cardigan"/></div>
            <div><div className="result-kicker">ENTITY · CAST-27</div><h3>Grandma</h3><p>The Founder&apos;s sharp, independent grandmother. Her failing eyesight—not her identity—is the problem the story promises to resolve.</p></div>
          </article>
        </div>

        <div className="trace-card">
          <div className="trace-header">
            <div><div className="result-kicker">DEPENDENCY TRACE</div><h3>The promise exists. The bridge does not.</h3></div>
            <div className="legend"><span className="good"/> Established <span className="bad"/> Missing <span className="future"/> Downstream</div>
          </div>
          <div className="trace-flow">
            <TraceNode badge="DAY 8" title="Grandma calls" detail="Eyesight is worsening" state="good" />
            <TraceArrow />
            <TraceNode badge="OBLIGATION" title={`${money} needed`} detail="Canonical goal" state="good" />
            <TraceArrow state="bad" />
            <TraceNode badge="MISSING" title="Funding event" detail="No reachable route" state="bad" />
            <TraceArrow state="future" />
            <TraceNode badge="FLAG" title={settings.triggerFlag} detail="Never emitted" state="future" />
            <TraceArrow state="future" />
            <TraceNode badge="PAYOFF" title="Grandma can read" detail="Post-op state" state="future" />
          </div>
          <div className="trace-insight"><span className="insight-icon">!</span><p><strong>Why this matters:</strong> the player can keep earning indefinitely, but time passing is not the same as causal progress. The game needs an attainable money path and a one-time story trigger.</p></div>
        </div>

        <div className="workbench">
          <div className="workbench-head">
            <div><div className="eyebrow dark">FROM DIAGNOSIS TO DELIVERY</div><h2>A repair packet the team can use</h2></div>
            <button className="button dark" onClick={() => showToast("Work packet copied to the demo clipboard")}>Copy work packet <Icon name="arrow" size={17}/></button>
          </div>
          <div className="tabs" role="tablist">
            {["diagnosis", "writing", "engineering", "design", "art"].map((tab) => <button role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}
          </div>
          <div className="tab-panel">
            <WorkPanel tab={activeTab} settings={settings} money={money}/>
          </div>
        </div>
      </section>

      <section className="art-section">
        <div className="art-heading">
          <div className="eyebrow">ART STATE REVIEW</div>
          <h2>See the future—<br/><em>without making it canon.</em></h2>
          <p>The system can identify a missing visual state, generate a grounded proposal from an approved identity reference, and keep it quarantined until a human decides.</p>
          <div className="art-principle"><Icon name="check" size={17}/><span><strong>Identity preserved.</strong> Age, jade earrings, warm gray bun, and quiet independence carry forward.</span></div>
          <div className="art-principle"><Icon name="check" size={17}/><span><strong>State changed.</strong> She can read comfortably after recovery; no magical de-aging or fantasy cure.</span></div>
        </div>
        <div className="art-comparison">
          <div className="art-card before">
            <img src="/art/vcs-grandma-preop.png" alt="Approved pre-operation Grandma character art"/>
            <div className="art-card-label"><span className="status approved">APPROVED</span><strong>Pre-operation identity</strong><small>CAST-27 · existing VCS asset</small></div>
          </div>
          <div className="art-transition"><Icon name="arrow" size={22}/><span>causal state change</span></div>
          <div className="art-card candidate">
            <img src="/art/vcs-grandma-postop-candidate.png" alt="Proposed illustration of Grandma reading after a successful operation"/>
            <div className="candidate-overlay"><span>PROPOSAL</span><small>Not canon until approved</small></div>
            <div className="art-card-label"><span className={`status ${candidateStatus}`}>{candidateStatus === "approved" ? "LOCALLY APPROVED" : candidateStatus === "revision" ? "REVISION NEEDED" : "AWAITING REVIEW"}</span><strong>Post-operation payoff</strong><small>Generated from the approved identity</small></div>
            <div className="art-actions">
              <button onClick={() => { setCandidateStatus("approved"); showToast("Local demo decision recorded"); }}><Icon name="check" size={16}/> Approve</button>
              <button onClick={() => { setCandidateStatus("revision"); showToast("Candidate marked for revision"); }}><Icon name="edit" size={16}/> Revise</button>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-section">
        <div className="proof-copy">
          <div className="eyebrow dark">A SECOND WORLD, THE SAME METHOD</div>
          <h2>Not a Grandma detector.<br/>A continuity engine.</h2>
          <p>In <em>Slap the Heavens</em>, the same trace tests power progression against an immutable physical rule, chapter setup, and approved character states.</p>
          <div className="proof-question">“Can Tae-min jump from F rank to B rank in Chapter 2?”</div>
          <div className="proof-answer"><span>CONFLICT</span><p>No. The rank ladder and zero-generation rule require staged recognition of broader redirection categories. Propose the missing demonstrations first.</p></div>
        </div>
        <div className="proof-art">
          <div className="proof-img tae"><img src="/art/slap-taemin-earth.png" alt="Han Tae-min in office clothes"/></div>
          <div className="proof-img beast"><img src="/art/slap-crownbeast.png" alt="The Abyssal Crownbeast"/></div>
          <div className="proof-vs">F <small>→</small> B?</div>
        </div>
      </section>

      <section className="sources-section">
        <div className="sources-head"><div><div className="eyebrow dark">PROJECT MEMORY</div><h2>Grounded in sources you control.</h2></div><label className="button outline"><Icon name="upload" size={17}/> Add text or JSON<input type="file" accept=".txt,.md,.json,.yaml,.yml" onChange={addSource}/></label></div>
        <div className="source-grid">{allSources.map((source) => <div className="source-item" key={source.id}><span className={`source-icon ${source.color}`}><Icon name="link" size={18}/></span><div><small>{source.id}</small><strong>{source.name}</strong><p>{source.detail}</p></div><span className="source-check"><Icon name="check" size={14}/></span></div>)}</div>
        <p className="local-note">Uploaded sources remain in this browser session. This MVP demonstrates the editable product surface; production ingestion would connect these records to the live reasoning service.</p>
      </section>

      <footer><div className="brand"><span className="brand-mark"><Icon name="spark" size={18}/></span><span>Continuity <i>Lab</i></span></div><p>Truth that can move—without drifting.</p><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button></footer>

      {showEditor && <div className="modal-backdrop" onMouseDown={() => setShowEditor(false)}><section className="editor" onMouseDown={(event) => event.stopPropagation()}>
        <div className="editor-head"><div><div className="eyebrow dark">EDITABLE DEMO</div><h2>Project contract</h2><p>Change the canonical variables that drive this trace.</p></div><button className="icon-button" onClick={() => setShowEditor(false)} aria-label="Close editor"><Icon name="x"/></button></div>
        <div className="form-grid">
          <label><span>Project title</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}/></label>
          <label><span>Protagonist ID</span><input value={draft.protagonist} onChange={(e) => setDraft({ ...draft, protagonist: e.target.value })}/></label>
          <label><span>Operation goal (USD)</span><input type="number" value={draft.goalAmount} onChange={(e) => setDraft({ ...draft, goalAmount: Number(e.target.value) })}/></label>
          <label><span>Completion flag</span><input value={draft.triggerFlag} onChange={(e) => setDraft({ ...draft, triggerFlag: e.target.value })}/></label>
          <label className="full"><span>Canonical note</span><textarea value={draft.canonNote} onChange={(e) => setDraft({ ...draft, canonNote: e.target.value })}/></label>
        </div>
        <div className="editor-note"><Icon name="clock" size={17}/><p>This prototype saves edits locally. A production version would version each approved change and recalculate its blast radius.</p></div>
        <div className="editor-actions"><button className="button ghost" onClick={resetProject}>Reset demo</button><button className="button primary" onClick={saveProject}>Save &amp; retrace <Icon name="arrow" size={17}/></button></div>
      </section></div>}
      {toast && <div className="toast"><Icon name="check" size={17}/>{toast}</div>}
    </main>
  );
}

function TraceNode({ badge, title, detail, state }: { badge: string; title: string; detail: string; state: string }) {
  return <div className={`trace-node ${state}`}><span>{badge}</span><strong>{title}</strong><small>{detail}</small></div>;
}

function TraceArrow({ state = "good" }: { state?: string }) {
  return <div className={`trace-arrow ${state}`}><span/><i>›</i></div>;
}

function WorkPanel({ tab, settings, money }: { tab: string; settings: ProjectSettings; money: string }) {
  const panels: Record<string, { number: string; title: string; copy: string; tasks: string[]; accent: string }> = {
    diagnosis: { number: "01", title: "The causal gap", copy: `The story promises a ${money} operation, but the current economy and trigger graph never jointly satisfy it.`, tasks: ["Keep Day 8 as the obligation setup", "Add a bounded path to the target amount", `Emit ${settings.triggerFlag} exactly once`, "Retire pre-operation dialogue after the flag"], accent: "violet" },
    writing: { number: "02", title: "Pay off what Day 8 plants", copy: "Write an earned outcome, not a sudden windfall. Grandma remains an independent person rather than a prize at the end of a money bar.", tasks: ["Seed the medical timeline before the deadline", "Give Grandma agency in the decision", "Tie business progress to the funding route", "Write a quiet post-operation reading scene"], accent: "orange" },
    engineering: { number: "03", title: "Make progress observable", copy: "Create an explicit story-state transition that can be tested, saved, and consumed by later dialogue and art.", tasks: ["Add goal-amount configuration", "Create a one-time funding resolver", "Persist the surgery-complete flag", "Add regression tests for pre/post states"], accent: "cyan" },
    design: { number: "04", title: "Make the route fair", copy: "Show the player that income, timing, and the operation are connected—without turning Grandma into a progress meter.", tasks: ["Surface runway against the medical deadline", "Telegraph qualifying funding events", "Protect against unwinnable random sequences", "Give the payoff breathing room"], accent: "green" },
    art: { number: "05", title: "Generate only the missing state", copy: "The approved Grandma identity exists. The gap is a post-operation payoff state with enough environmental context to communicate regained autonomy.", tasks: ["Use CAST-27 as identity reference", "Preserve age, bun, earrings, and dignity", "Show her reading without assistance", "Hold as proposal until human approval"], accent: "rose" },
  };
  const panel = panels[tab] ?? panels.diagnosis;
  return <div className="work-panel"><div className={`work-number ${panel.accent}`}>{panel.number}</div><div className="work-copy"><h3>{panel.title}</h3><p>{panel.copy}</p></div><div className="task-list">{panel.tasks.map((task) => <div key={task}><Icon name="check" size={15}/><span>{task}</span></div>)}</div></div>;
}

function getAnswer(kind: AnalysisKind, settings: ProjectSettings, money: string) {
  if (kind === "identity") return { status: "2 MATCHES", tone: "warning", headline: "“Grandma” is ambiguous across the project.", summary: `The source packet contains two grandmother roles: CAST-27, ${settings.protagonist}'s grandmother and the holder of the ${money} operation stake; and a secondary customer's grandmother mentioned in generated dialogue. The active story obligation belongs to CAST-27.`, evidence: ["CAST-27", "Narrative Contract", "Dialogue Index"] };
  if (kind === "relation") return { status: "RESOLVED", tone: "resolved", headline: `This is ${settings.protagonist}'s grandmother: CAST-27.`, summary: "The relationship is supported by the Day 8 call, the cast record, and the surgery obligation. A screenshot match should still be treated as an identification with evidence—not as visual certainty alone.", evidence: ["Day 8 event", "CAST-27", "Asset identity"] };
  if (kind === "blast-radius") return { status: "4 IMPACTS", tone: "warning", headline: "Changing the price changes more than one line of dialogue.", summary: "A $60,000 goal raises the required income curve, delays the eligible trigger window, changes investment pacing, and invalidates the current operation payoff tests. The story remains possible, but the economy must be rebalanced.", evidence: ["Economy Table", "Trigger Tests", "Ending Contract"] };
  if (kind === "general") return { status: "PARTIAL", tone: "warning", headline: "The project contains relevant evidence, but the question needs a sharper target.", summary: "Continuity Lab found related entities and state transitions. Name a character, event, amount, or proposed change to receive a concrete conflict and dependency trace.", evidence: ["Entity Index", "Event Graph", "Source Packet"] };
  return { status: "UNREACHABLE", tone: "danger", headline: "Not yet. The obligation is canonical; its completion path is not.", summary: `${settings.canonNote} The current build can accumulate days and generate plausible events, but no verified transition produces the ${settings.triggerFlag} state.`, evidence: ["Day 8 event", "Economy Table", "Trigger Graph", "Story Contract"] };
}

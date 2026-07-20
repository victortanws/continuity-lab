"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Verdict = "SUPPORTED" | "CONFLICT" | "AMBIGUOUS" | "UNREACHABLE" | "INSUFFICIENT_EVIDENCE" | "PROPOSAL";
type EngineMode = "ready" | "demonstration" | "gpt-5.6-sol" | "unavailable";
type ProjectMode = "sample" | "workspace";
type SourcePanel = "sample" | "upload" | "github" | "mcp";
type EnginePreference = "demo" | "live";
type AnalysisMode = "answer_question" | "evaluate_change" | "trace_dependencies";
type UploadDocumentType = "narrative" | "reference" | "proposal";

type AnalysisReceipt = {
  question: string;
  projectId: string;
  projectMode: ProjectMode;
  timeScope: string;
  temporalAxis?: string;
  storyPosition?: number;
  targetPosition?: number;
};

type EvidenceReference = {
  evidenceId: string;
  sourceId: string;
  locator: string;
  stance: "supports" | "opposes" | "context";
  supports: string;
  title?: string;
  excerpt?: string;
};

type EntityReference = {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  resolution: "resolved" | "candidate" | "ambiguous";
  evidenceIds: string[];
};
type DependencyEdge = { from: string; to: string; claimKey: string; claimKind: string; relation: string; status: string; evidenceIds: string[] };
type Conflict = { type: string; statement: string; severity: string; evidenceIds: string[] };
type ChangeProposal = { summary: string; assumptions: string[]; requiredChanges: string[]; downstreamRisks: string[] };
type AnalysisCheckFinding = { check: string; status: "supported" | "conflicted" | "unknown" | "not_applicable"; finding: string; evidenceIds: string[] };
type RoutingReceipt = {
  mode?: AnalysisMode;
  presentationDepth?: "focused" | "full";
  claimKinds?: string[];
  diagnostics?: string[];
  coverage?: { closure?: "closed" | "partial" | "open"; scope?: string };
};

type UiAnswer = {
  status: string;
  tone: "danger" | "warning" | "resolved";
  headline: string;
  summary: string;
  verdict: Verdict;
  confidence: string;
  revision: string;
  scope: string;
  coverageClosure: "closed" | "partial" | "open";
  evidence: EvidenceReference[];
  entities: EntityReference[];
  dependencies: DependencyEdge[];
  conflicts: Conflict[];
  checks: AnalysisCheckFinding[];
  blockers: string[];
  path: string[];
  proposal: ChangeProposal | null;
  followUps: string[];
  depth: "focused" | "full";
};

type StoredSource = {
  id: string;
  logicalName: string;
  filename: string;
  originalFilename: string;
  documentType: UploadDocumentType;
  role: string;
  lifecycle: string;
  byteSize: number;
  indexStatus: string;
  indexError?: string | null;
  extractionStatus?: string;
  authority: string;
};

type RepositoryState = {
  phase: "idle" | "syncing" | "ready" | "attention";
  repository: string;
  ref: string;
  commit: string;
  fileCount?: number;
  capability?: string;
  message: string;
};

const SAMPLE_PROJECT_ID = "vcs-demo";
const WORKSPACE_PROJECT_ID = "continuity-workspace";
const DEFAULT_QUESTION = "Can the founder pay for the $47,000 operation by Day 24—and what must be built if not?";

const EMPTY_ANSWER: UiAnswer = {
  status: "READY",
  tone: "warning",
  headline: "Ask a direct question—or test a consequential change.",
  summary: "Continuity Lab starts with the smallest safe evidence route. It opens identity, authority, and causal checks only when the question requires them.",
  verdict: "INSUFFICIENT_EVIDENCE",
  confidence: "—",
  revision: "Not traced yet",
  scope: "No evidence has been evaluated yet.",
  coverageClosure: "open",
  evidence: [],
  entities: [],
  dependencies: [],
  conflicts: [],
  checks: [],
  blockers: [],
  path: [],
  proposal: null,
  followUps: [],
  depth: "full",
};

const EMPTY_REPOSITORY: RepositoryState = {
  phase: "idle",
  repository: "No repository connected",
  ref: "Default branch",
  commit: "Not pinned yet",
  message: "Paste a public GitHub URL to create an immutable evidence snapshot.",
};

const SUGGESTED_QUESTIONS = [
  "Which story state has a consumer but no producer?",
  "What must happen before the investment offer can trigger?",
  "What breaks if the operation target changes to $60,000?",
];

const Icon = ({ name, size = 18 }: { name: string; size?: number }) => {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
  if (name === "upload") return <svg {...common}><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === "link") return <svg {...common}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>;
  if (name === "code") return <svg {...common}><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></svg>;
  if (name === "file") return <svg {...common}><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></svg>;
  if (name === "branch") return <svg {...common}><circle cx="6" cy="5" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 8c4 0 4-1 8-1"/></svg>;
  if (name === "download") return <svg {...common}><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M5 21h14"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg>;
};

export default function Home() {
  const [projectMode, setProjectMode] = useState<ProjectMode>("sample");
  const [sourcePanel, setSourcePanel] = useState<SourcePanel>("sample");
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [analyzedQuestion, setAnalyzedQuestion] = useState(DEFAULT_QUESTION);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [analysisReceipt, setAnalysisReceipt] = useState<AnalysisReceipt | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDocumentType, setUploadDocumentType] = useState<UploadDocumentType>("narrative");
  const [engineMode, setEngineMode] = useState<EngineMode>("ready");
  const [answer, setAnswer] = useState<UiAnswer>(EMPTY_ANSWER);
  const [sources, setSources] = useState<StoredSource[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [repositoryRef, setRepositoryRef] = useState("");
  const [repository, setRepository] = useState<RepositoryState>(EMPTY_REPOSITORY);
  const [toast, setToast] = useState("");
  const [showFullTrace, setShowFullTrace] = useState(false);

  const activeProjectId = projectMode === "sample" ? SAMPLE_PROJECT_ID : WORKSPACE_PROJECT_ID;
  const workspaceEvidenceCount = sources.length + (repository.fileCount ?? 0);
  const sourceLabel = projectMode === "sample"
    ? "VCS sample · reviewed evidence pack"
    : workspaceEvidenceCount
      ? `Live workspace · ${workspaceEvidenceCount} evidence item${workspaceEvidenceCount === 1 ? "" : "s"}`
      : "Live workspace · awaiting sources";
  const canRunReviewedLive = Boolean(
    analysisReceipt
    && analysisReceipt.projectMode === "sample"
    && analysisReceipt.question === DEFAULT_QUESTION
    && analysisReceipt.timeScope === "through the current VCS demonstration build"
    && analysisReceipt.temporalAxis === "day"
    && analysisReceipt.storyPosition === 8
    && analysisReceipt.targetPosition === 24,
  );

  const projectStats = useMemo(() => [
    { value: answer.entities.length, label: "entities resolved" },
    { value: answer.dependencies.length, label: "causal edges" },
    { value: answer.conflicts.length, label: "conflicts" },
    { value: answer.evidence.length, label: "cited sources" },
  ], [answer]);

  const loadRepositoryStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/continuity/repositories?projectId=${WORKSPACE_PROJECT_ID}`, { signal });
      if (!response.ok) return;
      const payload = await response.json() as Record<string, unknown>;
      const next = presentRepository(payload);
      if (next) {
        setRepository(next);
        if (next.repository.startsWith("http")) setRepositoryUrl(next.repository);
        if (next.ref !== "Default branch") setRepositoryRef(next.ref);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }, []);

  const loadSources = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/continuity/sources?projectId=${WORKSPACE_PROJECT_ID}`, { signal });
      if (!response.ok) return;
      const payload = await response.json() as { sources?: StoredSource[] };
      setSources(Array.isArray(payload.sources) ? payload.sources : []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }, []);

  const loadWorkspace = useCallback(async (signal?: AbortSignal) => {
    await Promise.all([loadRepositoryStatus(signal), loadSources(signal)]);
  }, [loadRepositoryStatus, loadSources]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadWorkspace(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadWorkspace]);

  useEffect(() => {
    if (repository.phase !== "syncing") return;
    const timer = window.setInterval(() => void loadRepositoryStatus(), 2500);
    return () => window.clearInterval(timer);
  }, [loadRepositoryStatus, repository.phase]);

  async function analyze(
    nextQuestion?: string,
    enginePreference?: EnginePreference,
    frozenReceipt?: AnalysisReceipt,
  ) {
    const value = (frozenReceipt?.question ?? nextQuestion ?? question).trim();
    if (!value) return;
    const analysis = analysisRequestFor(value);
    const receipt: AnalysisReceipt = frozenReceipt ?? {
      question: value,
      projectId: activeProjectId,
      projectMode,
      timeScope: projectMode === "sample"
        ? "through the current VCS demonstration build"
        : "the active commit-pinned workspace revision",
      ...(projectMode === "sample" ? { temporalAxis: "day", storyPosition: 8, targetPosition: inferTargetPosition(value) } : {}),
    };
    if (nextQuestion) setQuestion(nextQuestion);
    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/continuity/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: receipt.projectId,
          question: value,
          analysisMode: analysis.mode,
          proposedChange: analysis.proposedChange,
          enginePreference: enginePreference ?? (receipt.projectMode === "sample" ? "demo" : "live"),
          timeScope: receipt.timeScope,
          temporalAxis: receipt.temporalAxis,
          storyPosition: receipt.storyPosition,
          targetPosition: receipt.targetPosition,
        }),
      });
      const payload = await response.json() as { mode?: "demonstration" | "gpt-5.6-sol"; answer?: Record<string, unknown>; retrievedEvidence?: Array<Record<string, unknown>>; routing?: RoutingReceipt; error?: string; message?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.message ?? payload.error ?? "The continuity service is unavailable.");
      setAnswer(presentAnswer(payload.answer, payload.retrievedEvidence ?? [], payload.routing));
      setShowFullTrace(false);
      setAnalyzedQuestion(value);
      setHasAnalyzed(true);
      setAnalysisReceipt(receipt);
      setEngineMode(payload.mode ?? "demonstration");
      window.setTimeout(() => document.getElementById("analysis")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (error) {
      setAnalyzedQuestion(value);
      setHasAnalyzed(true);
      setAnalysisReceipt(receipt);
      setEngineMode("unavailable");
      setAnswer({
        ...EMPTY_ANSWER,
        status: "SETUP NEEDED",
        headline: receipt.projectMode === "workspace" ? "The workspace is stored, but live reasoning is not configured." : "The live evidence engine is not configured.",
        summary: `${error instanceof Error ? error.message : "The continuity service is unavailable."} No scripted answer has been substituted.`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function storeSourceFiles(files: File[]) {
    if (!files.length) return false;
    setIsUploading(true);
    const failures: string[] = [];
    let stored = 0;
    const ignored = Math.max(0, files.length - 12);
    try {
      for (const file of files.slice(0, 12)) {
        const form = new FormData();
        form.set("projectId", WORKSPACE_PROJECT_ID);
        form.set("projectTitle", "Continuity Lab workspace");
        form.set("documentType", uploadDocumentType);
        form.set("file", file);
        const response = await fetch("/api/continuity/sources", { method: "POST", body: form });
        const payload = await response.json() as { source?: StoredSource; capability?: string; message?: string; error?: string };
        if (!response.ok) {
          failures.push(`${file.name}: ${payload.message ?? payload.error ?? "upload failed"}`);
          continue;
        }
        stored += 1;
      }
      await loadSources();
      if (stored) setProjectMode("workspace");
      showToast(failures.length
        ? `${stored} stored · ${failures.length} rejected${ignored ? ` · ${ignored} beyond the 12-file limit` : ""}: ${failures[0]}`
        : `${stored} source${stored === 1 ? "" : "s"} stored as ${uploadDocumentType} evidence${ignored ? ` · ${ignored} beyond the 12-file limit were not sent` : ""}`);
      return stored > 0;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Upload failed.");
      return false;
    } finally {
      setIsUploading(false);
    }
  }

  async function addSource(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await storeSourceFiles(files);
  }

  async function addPastedSource(text: string) {
    const normalized = text.trim();
    if (!normalized) return false;
    return storeSourceFiles([new File([normalized], `pasted-source-${Date.now()}.txt`, { type: "text/plain" })]);
  }

  async function syncRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedRepository = repositoryUrl.trim();
    if (!requestedRepository) return;
    setRepository({
      phase: "syncing",
      repository: requestedRepository,
      ref: repositoryRef.trim() || "Default branch",
      commit: "Resolving revision…",
      message: "Selecting permitted files and pinning one exact revision. Repository code is never executed.",
    });
    try {
      const response = await fetch("/api/continuity/repositories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: WORKSPACE_PROJECT_ID, repository: requestedRepository, ref: repositoryRef.trim() || undefined }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(readMessage(payload) ?? "The repository could not be synchronized.");
      const next = presentRepository(payload);
      if (next) setRepository(next);
      setProjectMode("workspace");
      showToast("Commit-pinned repository snapshot created");
    } catch (error) {
      setRepository({
        phase: "attention",
        repository: requestedRepository,
        ref: repositoryRef.trim() || "Default branch",
        commit: "No snapshot created",
        message: error instanceof Error ? error.message : "The repository could not be synchronized.",
      });
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function exportTrace() {
    const blob = new Blob([JSON.stringify({ project: activeProjectId, question: analyzedQuestion, answer }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "continuity-lab-trace.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Cited trace exported");
  }

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="Continuity Lab home"><span className="brand-mark"><Icon name="branch" size={18}/></span><span>Continuity <i>Lab</i></span></a>
        <div className="nav-status"><span className="status-dot"/><span>{sourceLabel}</span></div>
        <div className="nav-actions"><a href="#sources">Connect sources</a><button onClick={exportTrace} disabled={!hasAnalyzed}><Icon name="download" size={15}/> Export trace</button></div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-image" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy-block">
            <div className="eyebrow">CONTINUITY INTELLIGENCE FOR GAME TEAMS</div>
            <h1>Can the story<br/><em>become true?</em></h1>
            <p>Upload a script, story bible, PDF, or game repository. Continuity Lab maps the relevant characters, events, rules, and dependencies—then GPT-5.6 answers with citations and shows what would break.</p>
          </div>

          <div className="question-card">
            <div className="mode-row">
              <button className={projectMode === "sample" ? "active" : ""} onClick={() => setProjectMode("sample")}><span/> Try the VCS sample</button>
              <button className={projectMode === "workspace" ? "active" : ""} onClick={() => setProjectMode("workspace")}><span/> Use my workspace</button>
            </div>
            <label htmlFor="continuity-question">Ask what is true—or what a change would break</label>
            <textarea id="continuity-question" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <div className="question-footer">
              <div className={`engine-badge ${engineMode}`}><span/>{engineLabel(engineMode, projectMode)}</div>
              <button className="primary-button" onClick={() => void analyze()} disabled={isAnalyzing || !question.trim()}>{isAnalyzing ? <span className="spinner"/> : <Icon name="arrow" size={18}/>} {isAnalyzing ? "Checking evidence…" : "Ask"}</button>
            </div>
          </div>

          <div className="prompt-row"><span>Try a test</span>{SUGGESTED_QUESTIONS.map((prompt) => <button key={prompt} onClick={() => void analyze(prompt)}>{prompt}</button>)}</div>
        </div>
      </section>

      <section className="sources-section" id="sources">
        <div className="section-intro">
          <div><div className="eyebrow dark">START WITH A SOURCE OF TRUTH</div><h2>Bring the project in once.<br/>Question the pinned revision.</h2></div>
          <p>The browser does not “read GitHub live” on every question. An explicit sync creates a safe, immutable snapshot. Uploads, GitHub, the Site, and a future MCP client all route into the same evidence service.</p>
        </div>

        <div className="pipeline" aria-label="Continuity Lab processing pipeline">
          {["Connect source", "Pin revision", "Resolve evidence", "Reason with GPT-5.6", "Validate & cite"].map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < 4 && <i>→</i>}</div>)}
        </div>

        <div className="source-workspace">
          <div className="source-tabs" role="tablist">
            {(["sample", "upload", "github", "mcp"] as SourcePanel[]).map((tab) => <button key={tab} role="tab" aria-selected={sourcePanel === tab} className={sourcePanel === tab ? "active" : ""} onClick={() => setSourcePanel(tab)}>{tab === "sample" ? "VCS sample" : tab === "upload" ? "Upload files" : tab === "github" ? "GitHub repository" : "MCP"}</button>)}
          </div>

          <div className="source-panel">
            {sourcePanel === "sample" && (
              <SamplePanel onUse={() => { setProjectMode("sample"); setQuestion(DEFAULT_QUESTION); showToast("VCS sample selected"); }}/>
            )}
            {sourcePanel === "upload" && (
              <UploadPanel sources={sources} isUploading={isUploading} documentType={uploadDocumentType} setDocumentType={setUploadDocumentType} onChange={addSource} onPaste={addPastedSource}/>
            )}
            {sourcePanel === "github" && (
              <GitHubPanel repository={repository} repositoryUrl={repositoryUrl} repositoryRef={repositoryRef} setRepositoryUrl={setRepositoryUrl} setRepositoryRef={setRepositoryRef} onSubmit={syncRepository}/>
            )}
            {sourcePanel === "mcp" && <McpPanel/>}
          </div>
        </div>
      </section>

      <section className={`analysis-section ${hasAnalyzed ? "has-result" : ""}`} id="analysis">
        <div className="section-heading">
          <div><div className="eyebrow dark">CITED CONTINUITY TRACE</div><h2>{hasAnalyzed ? analyzedQuestion : "The answer surface changes with the evidence."}</h2></div>
          <span className={`verdict ${answer.tone}`}><span/>{answer.status}</span>
        </div>

        {engineMode === "demonstration" && <div className="honesty-banner"><strong>Validated sample mode</strong><span>{canRunReviewedLive ? "This answer uses the reviewed VCS fallback. The icon reruns this exact frozen receipt through the configured OpenAI API path." : "This answer uses the reviewed VCS fallback. Live API execution is exposed only for the frozen demonstration question."}</span>{canRunReviewedLive && <button className="live-test-icon" aria-label="Run this exact question live with the OpenAI API" onClick={() => void analyze(undefined, "live", analysisReceipt ?? undefined)} disabled={isAnalyzing}><Icon name="code" size={17}/></button>}</div>}
        {engineMode === "unavailable" && <div className="honesty-banner attention"><strong>Live setup incomplete</strong><span>{analysisReceipt?.projectMode === "sample" ? "Add the OpenAI API key in Site settings to run this reviewed sample through GPT-5.6; the sample does not require repository indexing." : "The workspace remains stored safely. Add the OpenAI API key in Site settings to index it and activate GPT-5.6 retrieval."}</span></div>}

        <div className="answer-grid">
          <article className="answer-card primary-answer">
            <div className="answer-meta"><span>{answer.verdict.replaceAll("_", " ")}</span><span>{answer.confidence} confidence</span><span>{answer.coverageClosure} coverage</span><span>{shortRevision(answer.revision)}</span></div>
            <h3>{answer.headline}</h3>
            <p>{answer.summary}</p>
          </article>
          {answer.depth === "full" || showFullTrace
            ? <div className="stat-grid">{projectStats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
            : <div className="focused-route"><strong>Focused answer</strong><span>{answer.evidence.length} decisive source{answer.evidence.length === 1 ? "" : "s"}</span></div>}
        </div>

        {answer.depth === "focused" && !showFullTrace ? (
          <article className="focused-answer-trace">
            <div><span>DECISIVE CONTEXT</span><strong>{answer.entities.slice(0, 4).map((entity) => entity.name).join(" · ") || "No entity was confidently resolved"}</strong><small>{answer.evidence.slice(0, 3).map((item) => item.title || item.sourceId).join(" · ") || "No admissible citation was found"}</small></div>
            <button type="button" onClick={() => setShowFullTrace(true)}>Show evidence trace <Icon name="arrow" size={14}/></button>
          </article>
        ) : <>
          <div className="inspection-grid">
            <article className="instrument-card dependency-card">
              <div className="card-heading"><div><span>CAUSAL SLICE</span><h3>What depends on what</h3></div><small>{answer.dependencies.length || answer.path.length} relation{(answer.dependencies.length || answer.path.length) === 1 ? "" : "s"}</small></div>
              <DependencyView dependencies={answer.dependencies} path={answer.path}/>
              {answer.blockers.length > 0 && <div className="blocker-list"><strong>Blockers</strong>{answer.blockers.map((item) => <p key={item}><span>!</span>{item}</p>)}</div>}
            </article>

            <article className="instrument-card entity-card">
              <div className="card-heading"><div><span>ENTITY RESOLUTION</span><h3>Who and what the answer means</h3></div><small>question-scoped</small></div>
              <div className="entity-list">{answer.entities.length ? answer.entities.map((entity) => <div key={entity.id}><span>{entity.type} · {entity.resolution}</span><strong>{entity.name}</strong><small>{entity.id}{entity.aliases.length ? ` · ${entity.aliases.slice(0, 2).join(", ")}` : ""} · {entity.evidenceIds.length} source{entity.evidenceIds.length === 1 ? "" : "s"}</small></div>) : <EmptyState copy="Run a trace to resolve the entities relevant to this question."/>}</div>
            </article>
          </div>

          <div className="inspection-grid lower">
            <article className="instrument-card evidence-card">
              <div className="card-heading"><div><span>PROVENANCE</span><h3>Evidence you can inspect</h3></div><small>{answer.scope}</small></div>
              <div className="evidence-list">{answer.evidence.length ? answer.evidence.map((item) => <details key={item.evidenceId}><summary><span className={`stance ${item.stance}`}>{item.stance}</span><span><strong>{item.title || item.sourceId}</strong><code>{item.locator}</code></span><Icon name="arrow" size={14}/></summary><div className="evidence-detail"><p>{item.supports}</p>{item.excerpt && <blockquote>{item.excerpt}</blockquote>}</div></details>) : <EmptyState copy="Every factual verdict will appear here with its source and locator."/>}</div>
            </article>

            <article className="instrument-card repair-card">
              <div className="card-heading"><div><span>MINIMAL REPAIR</span><h3>Turn diagnosis into work</h3></div></div>
              {answer.proposal ? <><p className="proposal-summary">{answer.proposal.summary}</p><div className="repair-list">{answer.proposal.requiredChanges.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>)}</div>{answer.proposal.downstreamRisks.length > 0 && <details><summary>Downstream risks</summary>{answer.proposal.downstreamRisks.map((risk) => <p key={risk}>{risk}</p>)}</details>}</> : <EmptyState copy="When a change is possible, the engine returns assumptions, affected work, and downstream risks without silently promoting the proposal to canon."/>}
            </article>
          </div>

          {answer.checks.length > 0 && <article className="closure-audit"><div className="card-heading"><div><span>SEMANTIC CLOSURE</span><h3>Every routed check has an explicit result</h3></div><small>{answer.checks.filter((item) => item.status === "unknown").length} unknown</small></div><div className="closure-grid">{answer.checks.map((item) => <div key={item.check} className={item.status}><span>{item.status.replaceAll("_", " ")}</span><strong>{item.check.replaceAll("_", " ")}</strong><p>{item.finding}</p></div>)}</div></article>}
        </>}

        {answer.conflicts.length > 0 && <div className="conflict-strip"><strong>{answer.conflicts.length} conflict{answer.conflicts.length === 1 ? "" : "s"} found</strong>{answer.conflicts.map((conflict) => <p key={`${conflict.type}-${conflict.statement}`}><span>{conflict.severity}</span>{conflict.statement}</p>)}</div>}
        {answer.followUps.length > 0 && <div className="follow-ups"><span>Keep testing</span>{answer.followUps.slice(0, 3).map((item) => <button key={item} onClick={() => void analyze(item)}>{item}<Icon name="arrow" size={14}/></button>)}</div>}
      </section>

      <section className="build-week-section">
        <div><div className="eyebrow">THE BUILD WEEK PROOF</div><h2>Source → conflict → repair.<br/><em>In one visible loop.</em></h2></div>
        <div className="proof-points"><div><span>01</span><strong>Real input</strong><p>A fresh file or commit-pinned repository—not a pasted summary.</p></div><div><span>02</span><strong>Real reasoning</strong><p>GPT-5.6 operates on retrieved evidence and returns a strict answer contract.</p></div><div><span>03</span><strong>Useful output</strong><p>Exact citations, causal blockers, blast radius, and a repair packet.</p></div></div>
      </section>

      <footer><div className="brand"><span className="brand-mark"><Icon name="branch" size={18}/></span><span>Continuity <i>Lab</i></span></div><p>Make every story change explain itself.</p><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button></footer>
      {toast && <div className="toast"><Icon name="check" size={16}/>{toast}</div>}
    </main>
  );
}

function SamplePanel({ onUse }: { onUse: () => void }) {
  return <div className="sample-panel"><div className="source-symbol coral"><Icon name="branch" size={23}/></div><div><span className="panel-kicker">REVIEWED EXAMPLE</span><h3>VibeCode Simulator</h3><p>A deliberately small evidence pack for testing identity, reachability, trigger gaps, and counterfactual cost changes before connecting the real repository.</p><div className="sample-tags"><span>story contract</span><span>economy</span><span>runtime triggers</span><span>tests</span></div></div><button className="outline-button" onClick={onUse}>Use sample <Icon name="arrow" size={16}/></button></div>;
}

function UploadPanel({ sources, isUploading, documentType, setDocumentType, onChange, onPaste }: { sources: StoredSource[]; isUploading: boolean; documentType: UploadDocumentType; setDocumentType: (value: UploadDocumentType) => void; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onPaste: (text: string) => Promise<boolean> }) {
  const [pastedText, setPastedText] = useState("");
  const typeExplanation = documentType === "narrative"
    ? "Characters, events, rules, and intended causal structure. This is still reference-authority evidence, not approved canon."
    : documentType === "proposal"
      ? "A possible future, revision, or experiment. It stays proposed and cannot silently become current truth."
      : "Background, research, commentary, or historical material used primarily for identity and context.";
  return <div className="upload-panel"><div className="upload-input-column"><label className="upload-classifier"><span>How should this document be read?</span><select value={documentType} disabled={isUploading} onChange={(event) => setDocumentType(event.target.value as UploadDocumentType)}><option value="narrative">Story or source text</option><option value="reference">Reference material</option><option value="proposal">Draft or proposal</option></select><small>{typeExplanation}</small></label><label className="upload-drop"><input type="file" multiple accept=".txt,.md,.markdown,.json,.yaml,.yml,.xml,.csv,.tsv,.pdf,.doc,.docx,.html,.htm,.pptx" onChange={(event) => void onChange(event)}/><span className="source-symbol blue"><Icon name="upload" size={23}/></span><strong>{isUploading ? "Storing and indexing…" : "Upload up to 12 sources"}</strong><p>TXT, Markdown, JSON, YAML, XML, CSV/TSV, HTML · operator preview: searchable PDF, DOC/DOCX, PPTX · 20 MB each</p><small>PDF/Office upload is allowlisted because its contents are not yet credential-scanned. XLSX, images, scanned/OCR-only PDFs, EPUB, and RTF need a dedicated extractor.</small></label><div className="paste-source"><textarea value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="Or paste a story, summary, cast list, ID table, or notes…"/><button type="button" disabled={isUploading || !pastedText.trim()} onClick={() => void onPaste(pastedText).then((stored) => { if (stored) setPastedText(""); })}>Store pasted text</button></div></div><div className="uploaded-list"><div className="panel-heading"><span>WORKSPACE SOURCES</span><strong>{sources.length}</strong></div>{sources.length ? sources.slice(0, 5).map((source) => <div key={source.id} title={source.indexError || "Provider indexing does not independently verify complete extraction."}><Icon name="file" size={17}/><span><strong>{source.logicalName || source.originalFilename || source.filename}</strong><small>{formatBytes(source.byteSize)} · {source.documentType} · {source.authority} · {(source.extractionStatus ?? "not_yet_verified").replaceAll("_", " ")}</small></span><em className={source.indexStatus}>{source.indexStatus.replaceAll("_", " ")}</em></div>) : <EmptyState copy="Each source will show storage/index status. Indexed means searchable by the provider; it does not prove that every page or entity was extracted."/>}</div></div>;
}

function GitHubPanel({ repository, repositoryUrl, repositoryRef, setRepositoryUrl, setRepositoryRef, onSubmit }: { repository: RepositoryState; repositoryUrl: string; repositoryRef: string; setRepositoryUrl: (value: string) => void; setRepositoryRef: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="github-panel"><form onSubmit={(event) => void onSubmit(event)}><div className="panel-kicker">READ-ONLY GITHUB SNAPSHOT</div><h3>Pin the codebase that the answer should mean.</h3><p>A branch name is resolved once. Every selected file is then tied to the resulting SHA, so a later push cannot silently rewrite an old answer.</p><label><span>Repository URL</span><input type="url" placeholder="https://github.com/your-team/your-game" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} required/></label><label><span>Branch, tag, or commit <i>optional</i></span><input placeholder="Default branch" value={repositoryRef} onChange={(event) => setRepositoryRef(event.target.value)}/></label><button className="dark-button" disabled={repository.phase === "syncing" || !repositoryUrl.trim()}>{repository.phase === "syncing" ? <span className="spinner light"/> : <Icon name="branch" size={17}/>} {repository.phase === "syncing" ? "Creating snapshot…" : "Create repository snapshot"}</button></form><div className={`repo-receipt ${repository.phase}`}><div className="receipt-head"><span/><strong>{repository.phase === "ready" ? "Snapshot ready" : repository.phase === "syncing" ? "Snapshot in progress" : repository.phase === "attention" ? "Needs attention" : "Awaiting repository"}</strong></div><dl><div><dt>Repository</dt><dd>{shortRepository(repository.repository)}</dd></div><div><dt>Revision</dt><dd>{repository.ref}</dd></div><div><dt>Commit</dt><dd>{shortCommit(repository.commit)}</dd></div>{typeof repository.fileCount === "number" && <div><dt>Evidence files</dt><dd>{repository.fileCount}</dd></div>}<div><dt>Capability</dt><dd>{(repository.capability ?? "not connected").replaceAll("_", " ")}</dd></div></dl><p>{repository.message}</p></div></div>;
}

function McpPanel() {
  return <div className="mcp-panel"><div><div className="source-symbol ink"><Icon name="code" size={23}/></div><span className="panel-kicker">ONE CORE, MORE THAN ONE SURFACE</span><h3>Use the reviewed sample from ChatGPT, Codex, or another MCP client.</h3><p>The stateless <code>/mcp</code> transport exposes three read-only analysis tools over the immutable VCS demonstration. It never synchronizes GitHub or calls a paid provider. Private workspaces remain disabled until connector authentication and tenant scoping are implemented.</p></div><div className="mcp-contract"><span>REVIEWED SAMPLE MCP</span><code>answer_question(question)</code><code>trace_dependencies(target)</code><code>analyze_change(proposal)</code><small>Executable sample transport · pinned to vcs-demo-r1 · authenticated private workspace transport is next.</small></div></div>;
}

function DependencyView({ dependencies, path }: { dependencies: DependencyEdge[]; path: string[] }) {
  if (dependencies.length) return <div className="dependency-list">{dependencies.slice(0, 7).map((edge, index) => <div key={`${edge.from}-${edge.to}-${index}`} className={edge.status}><strong>{edge.from}</strong><span title={`${edge.claimKind} · ${edge.claimKey}`}><i/>{edge.relation}</span><strong>{edge.to}</strong><em>{edge.claimKind} · {edge.status}</em></div>)}</div>;
  if (path.length) return <div className="path-list">{path.map((item, index) => <div key={`${item}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>)}</div>;
  return <EmptyState copy="A dependency slice will appear here instead of a generic graph hairball."/>;
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="empty-state"><span>—</span><p>{copy}</p></div>;
}

function engineLabel(mode: EngineMode, projectMode: ProjectMode) {
  if (mode === "gpt-5.6-sol") return "GPT-5.6 Sol · live reasoning";
  if (mode === "demonstration") return "Reviewed VCS sample";
  if (mode === "unavailable") return "Live reasoning needs setup";
  return projectMode === "sample" ? "VCS sample ready" : "Workspace selected";
}

function presentAnswer(raw: Record<string, unknown>, retrievedEvidence: Array<Record<string, unknown>> = [], routing?: RoutingReceipt): UiAnswer {
  const verdict = isVerdict(raw.verdict) ? raw.verdict : "INSUFFICIENT_EVIDENCE";
  const reachability = asRecord(raw.reachability) ?? {};
  const retrievedById = new Map(retrievedEvidence.map((item) => [stringValue(item.id, ""), item]));
  const evidence = arrayOfRecords(raw.evidence).map((item) => {
    const evidenceId = stringValue(item.evidenceId, "evidence");
    const retrieved = retrievedById.get(evidenceId);
    return {
      evidenceId, sourceId: stringValue(item.sourceId, "Source"), locator: stringValue(item.locator, "locator unavailable"),
      stance: ["supports", "opposes", "context"].includes(String(item.stance)) ? item.stance as EvidenceReference["stance"] : "context", supports: stringValue(item.supports, "Evidence used by the answer."),
      title: retrieved ? stringValue(retrieved.title, "") : undefined,
      excerpt: retrieved ? stringValue(retrieved.text, "") : undefined,
    };
  });
  const entities = arrayOfRecords(raw.entities).map((item) => ({
    id: stringValue(item.id, "unknown"),
    name: stringValue(item.name, "Unnamed entity"),
    type: stringValue(item.type, "entity"),
    aliases: stringArray(item.aliases),
    resolution: ["resolved", "candidate", "ambiguous"].includes(String(item.resolution)) ? item.resolution as EntityReference["resolution"] : "candidate",
    evidenceIds: stringArray(item.evidenceIds),
  }));
  const dependencies = arrayOfRecords(raw.dependencies).map((item) => ({ from: stringValue(item.from, "Unknown source"), to: stringValue(item.to, "Unknown target"), claimKey: stringValue(item.claimKey, "unscoped"), claimKind: stringValue(item.claimKind, "causal"), relation: stringValue(item.relation, "relates to"), status: stringValue(item.status, "proposed"), evidenceIds: stringArray(item.evidenceIds) }));
  const conflicts = arrayOfRecords(raw.conflicts).map((item) => ({ type: stringValue(item.type, "conflict"), statement: stringValue(item.statement, "Conflicting evidence found."), severity: stringValue(item.severity, "medium"), evidenceIds: stringArray(item.evidenceIds) }));
  const checks = arrayOfRecords(raw.analysisChecks).map((item) => ({
    check: stringValue(item.check, "verification_and_unknowns"),
    status: ["supported", "conflicted", "unknown", "not_applicable"].includes(String(item.status)) ? item.status as AnalysisCheckFinding["status"] : "unknown",
    finding: stringValue(item.finding, "This dimension was not resolved."),
    evidenceIds: stringArray(item.evidenceIds),
  }));
  const proposalRaw = asRecord(raw.proposal);
  const proposal = proposalRaw ? { summary: stringValue(proposalRaw.summary, "Proposed repair"), assumptions: stringArray(proposalRaw.assumptions), requiredChanges: stringArray(proposalRaw.requiredChanges), downstreamRisks: stringArray(proposalRaw.downstreamRisks) } : null;
  const status = verdict === "INSUFFICIENT_EVIDENCE" ? "EVIDENCE GAP" : verdict.replaceAll("_", " ");
  const tone: UiAnswer["tone"] = verdict === "CONFLICT" || verdict === "UNREACHABLE" ? "danger" : verdict === "SUPPORTED" ? "resolved" : "warning";
  const headlines: Record<Verdict, string> = {
    SUPPORTED: "The current evidence supports this conclusion.", CONFLICT: "The active project evidence disagrees.", AMBIGUOUS: "The question resolves to more than one meaning.", UNREACHABLE: "The promise exists; its completion path does not.", INSUFFICIENT_EVIDENCE: "The available evidence cannot support a confident answer yet.", PROPOSAL: "The change is possible, but it has a dependency cost.",
  };
  const depth: UiAnswer["depth"] = routing?.presentationDepth === "focused" ? "focused" : "full";
  return {
    status, tone, headline: headlines[verdict], summary: stringValue(raw.answer, "No answer was returned."), verdict,
    confidence: stringValue(raw.confidence, "unknown"), revision: stringValue(raw.projectRevision, "unversioned"),
    scope: stringValue(routing?.coverage?.scope, stringValue(reachability.completenessScope, "Retrieved evidence only")),
    coverageClosure: routing?.coverage?.closure ?? "open",
    evidence, entities, dependencies, conflicts, checks, blockers: stringArray(reachability.blockers), path: stringArray(reachability.path), proposal, followUps: stringArray(raw.followUpQuestions), depth,
  };
}

function presentRepository(payload: Record<string, unknown>): RepositoryState | null {
  const records = [payload, asRecord(payload.connection), asRecord(payload.snapshot), asRecord(payload.repository)].filter(Boolean) as Record<string, unknown>[];
  const collection = Array.isArray(payload.repositories) ? payload.repositories : [];
  const newest = collection.length ? asRecord(collection[0]) : null;
  if (newest) records.push(newest, asRecord(newest.connection) ?? {}, asRecord(newest.snapshot) ?? {});
  const repository = firstString(records, ["repositoryUrl", "htmlUrl", "url", "repository", "fullName"]);
  const commit = firstString(records, ["commitSha", "commit", "sha", "snapshotId"]);
  if (!repository && !commit) return null;
  const statusRecords = [
    asRecord(payload.snapshot),
    newest ? asRecord(newest.snapshot) : null,
    payload,
    asRecord(payload.connection),
  ].filter(Boolean) as Record<string, unknown>[];
  const rawStatus = firstString(statusRecords, ["indexStatus", "status", "syncStatus"])?.toLowerCase() ?? "ready";
  const phase: RepositoryState["phase"] = rawStatus.includes("fail") || rawStatus.includes("error") ? "attention" : rawStatus.includes("indexing") || rawStatus.includes("pending") || rawStatus.includes("sync") ? "syncing" : "ready";
  return {
    phase, repository: repository ?? "Connected repository", ref: firstString(records, ["requestedRef", "ref", "branch", "tag"]) ?? "Default branch", commit: commit ?? "Pinned snapshot",
    fileCount: firstNumber(records, ["fileCount", "selectedFileCount", "entries"]), capability: firstString(records, ["capability", "indexStatus"]),
    message: readMessage(payload) ?? (phase === "syncing" ? "The immutable snapshot is stored; the evidence index is still being prepared." : "Ask a question against this pinned revision."),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function arrayOfRecords(value: unknown) { return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : []; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function stringValue(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function isVerdict(value: unknown): value is Verdict { return ["SUPPORTED", "CONFLICT", "AMBIGUOUS", "UNREACHABLE", "INSUFFICIENT_EVIDENCE", "PROPOSAL"].includes(String(value)); }
function firstString(records: Record<string, unknown>[], keys: string[]) { for (const record of records) for (const key of keys) if (typeof record[key] === "string" && String(record[key]).trim()) return String(record[key]); return undefined; }
function firstNumber(records: Record<string, unknown>[], keys: string[]) { for (const record of records) for (const key of keys) { const value = record[key]; if (typeof value === "number" && Number.isFinite(value)) return value; if (Array.isArray(value)) return value.length; } return undefined; }
function readMessage(payload: Record<string, unknown>) { return firstString([payload, asRecord(payload.error) ?? {}, asRecord(payload.snapshot) ?? {}], ["message", "detail", "suggestedAction", "error"]); }
function shortRepository(value: string) { return value.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, ""); }
function shortCommit(value: string) { return /^[a-f\d]{12,}$/i.test(value) ? value.slice(0, 10) : value; }
function shortRevision(value: string) { return value.length > 24 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value; }
function formatBytes(value: number) { if (value < 1000) return `${value} B`; if (value < 1_000_000) return `${Math.round(value / 1000)} KB`; return `${(value / 1_000_000).toFixed(1)} MB`; }

function analysisRequestFor(question: string): { mode: AnalysisMode; proposedChange: string | null } {
  const normalized = question.toLowerCase();
  const evaluatesChange = /\bwhat (?:breaks|changes|is affected)\b|\bblast radius\b|\bif (?:we |i )?(?:change|remove|replace|add|move)\b|\bchanges? (?:to|from)\b/.test(normalized);
  if (evaluatesChange) return { mode: "evaluate_change", proposedChange: question };
  const tracesDependencies = /\bmust happen\b|\bdepend(?:s|encies)?\b|\bprerequisite\b|\btrigger\b|\bproducer\b|\breach(?:able|ability)?\b|\bcan .+ (?:pay|reach|unlock|occur|happen)\b/.test(normalized);
  return { mode: tracesDependencies ? "trace_dependencies" : "answer_question", proposedChange: null };
}

function inferTargetPosition(question: string): number | undefined {
  const value = question.match(/\b(?:by|through|before|until)\s+(?:day|chapter|ch|beat|scene|turn|episode|ep|step)[\s_:#-]*(\d+(?:\.\d+)?)\b/i)?.[1];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

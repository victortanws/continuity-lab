"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { VCS_DEMO_FOLLOW_UPS, VCS_DEMO_QUESTIONS, VCS_DEMO_SUGGESTED_QUESTIONS, VCS_DEMO_TIME_SCOPE } from "@/lib/continuity/demo-questions";
import { analysisModeForQuestion } from "@/lib/continuity/question-intent";

type Verdict = "SUPPORTED" | "CONFLICT" | "AMBIGUOUS" | "UNREACHABLE" | "INSUFFICIENT_EVIDENCE" | "PROPOSAL";
type EngineMode = "ready" | "demonstration" | "gpt-5.6-sol" | "unavailable";
type ProjectMode = "sample" | "workspace";
type SourcePanel = "sample" | "upload" | "github" | "mcp";
type EnginePreference = "demo" | "live";
type AnalysisMode = "answer_question" | "evaluate_change" | "trace_dependencies";
type UploadDocumentType = "narrative" | "reference" | "proposal";
type Theme = "light" | "dark";

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
  projectScope?: string;
  message: string;
};

type RepositoryScopeChoice = {
  id: string;
  label: string;
  rootPath: string;
  kind: string;
};

const SAMPLE_PROJECT_ID = "vcs-demo";
const WORKSPACE_PROJECT_ID = "continuity-workspace";
const DEFAULT_QUESTION: string = VCS_DEMO_QUESTIONS.reachability;

const REVIEWED_EXAMPLE_RECEIPT: AnalysisReceipt = {
  question: DEFAULT_QUESTION,
  projectId: SAMPLE_PROJECT_ID,
  projectMode: "sample",
  timeScope: VCS_DEMO_TIME_SCOPE,
  temporalAxis: "day",
  storyPosition: 8,
  targetPosition: 8,
};

const REVIEWED_EXAMPLE_ANSWER: UiAnswer = {
  status: "NOT REACHABLE IN THIS PROTOTYPE",
  tone: "danger",
  headline: "No. The current prototype cannot earn or pay the $47,000.",
  summary: "The playable build covers only Days 7–8 and starts with $700. Its available income cannot reach $47,000 in that slice. The wider story plans to fund the operation later, after a Seed Round grows the company and a separate approved event gives the Founder legitimate personal income, but neither that progression nor the operation-payment action exists in the current game.",
  verdict: "UNREACHABLE",
  confidence: "high",
  revision: "vcs-demo-r2",
  scope: "The current prototype contract, story canon, game code, and tests",
  coverageClosure: "open",
  evidence: [
    { evidenceId: "EV-VCS-NARRATIVE-CONTRACT", sourceId: "Story canon", locator: "Current playable slice", stance: "supports", supports: "The operation is a later-story obligation and is explicitly not reachable in the current Days 7–8 slice.", title: "Story canon" },
    { evidenceId: "EV-VCS-ECONOMY", sourceId: "Prototype contract", locator: "Opening economy", stance: "supports", supports: "The two-day demonstration starts with $700 and its displayed income and costs are designed only for that short chapter.", title: "Prototype contract" },
    { evidenceId: "EV-VCS-TRIGGER-REGISTRY", sourceId: "Current game and tests", locator: "Operation reachability", stance: "supports", supports: "The current build has no approved event that earns the required personal funds, pays the hospital, or records the operation as funded.", title: "Current game and tests" },
    { evidenceId: "EV-VCS-ENDING-CONTRACT", sourceId: "Future-story plan", locator: "Seed Round and The Payment", stance: "context", supports: "The planned Seed Round cannot pay the bill directly from company cash. A later salary, disclosed secondary sale, dividend, or other approved source of personal funds must come first.", title: "Future-story plan" },
  ],
  entities: [
    { id: "FOUNDER", name: "The founder", type: "player character", aliases: ["protagonist"], resolution: "resolved", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT"] },
    { id: "CAST-27", name: "Grandma", type: "character", aliases: ["the founder's grandmother"], resolution: "resolved", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT"] },
    { id: "GOAL-OPERATION", name: "$47,000 operation", type: "story goal", aliases: ["operation payment"], resolution: "resolved", evidenceIds: ["EV-VCS-NARRATIVE-CONTRACT", "EV-VCS-ECONOMY"] },
  ],
  dependencies: [
    { from: "The Founder receives $47,000 in legitimate personal funds", to: "The Founder can pay the hospital", claimKey: "operation-payment", claimKind: "game rule", relation: "must happen first", status: "missing", evidenceIds: ["EV-VCS-TRIGGER-REGISTRY", "EV-VCS-ENDING-CONTRACT"] },
    { from: "The hospital payment is recorded", to: "Grandma's recovery scene", claimKey: "operation-payoff", claimKind: "story requirement", relation: "must happen before", status: "blocked", evidenceIds: ["EV-VCS-ENDING-CONTRACT"] },
  ],
  conflicts: [],
  checks: [],
  blockers: ["The playable build stops after Day 8. It starts with $700, and its current jobs and revenue cannot reach $47,000.", "Even if enough money were available, the build has no action that pays the hospital and records Grandma's operation as funded."],
  path: [],
  proposal: {
    summary: "Build the missing later-story bridge from company growth to the Founder's legitimate personal funds, then add the actual operation payment.",
    assumptions: ["The later story will implement the Seed Round and a lawful source of personal liquidity before the payment."],
    requiredChanges: ["Implement the later Seed Round chapter and its requirements.", "Add an approved source of the Founder's personal funds, such as salary, a disclosed secondary sale, or a dividend.", "Add a one-time hospital payment action that uses those personal funds—not company cash.", "Save the operation-funded result and use it to unlock Grandma's recovery scene.", "Add a test that proves the complete sequence works and cannot charge twice."],
    downstreamRisks: ["Marc's later Seed Round gives the company money; it does not automatically give the Founder personal money for Grandma's bill. The financing terms and the personal-liquidity event must remain separate.", "Grandma's recovery scene and pre-operation activity art must both use the same operation-funded result, or the story can show her as still waiting after payment."],
  },
  followUps: [...VCS_DEMO_FOLLOW_UPS.reachability],
  depth: "full",
};

const EMPTY_ANSWER: UiAnswer = {
  status: "READY",
  tone: "warning",
  headline: "Ask a question about your material.",
  summary: "You can ask what is true, what can happen next, whether two sources disagree, or what else must change if you revise part of the project.",
  verdict: "INSUFFICIENT_EVIDENCE",
  confidence: "—",
  revision: "No answer yet",
  scope: "No sources have been checked yet.",
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
  commit: "Not saved yet",
  message: "Add a public repository. We look for likely sources of truth and relevant code or tests, but never run the code.",
};

const SUGGESTED_QUESTIONS = [...VCS_DEMO_SUGGESTED_QUESTIONS];

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
  if (name === "moon") return <svg {...common}><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>;
  if (name === "sun") return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg>;
};

export default function Home() {
  const [projectMode, setProjectMode] = useState<ProjectMode>("sample");
  const [sourcePanel, setSourcePanel] = useState<SourcePanel>("sample");
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [analyzedQuestion, setAnalyzedQuestion] = useState(DEFAULT_QUESTION);
  const [hasAnalyzed, setHasAnalyzed] = useState(true);
  const [analysisReceipt, setAnalysisReceipt] = useState<AnalysisReceipt | null>(REVIEWED_EXAMPLE_RECEIPT);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [engineMode, setEngineMode] = useState<EngineMode>("demonstration");
  const [answer, setAnswer] = useState<UiAnswer>(REVIEWED_EXAMPLE_ANSWER);
  const [sources, setSources] = useState<StoredSource[]>([]);
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [repositoryRef, setRepositoryRef] = useState("");
  const [repository, setRepository] = useState<RepositoryState>(EMPTY_REPOSITORY);
  const [repositoryScope, setRepositoryScope] = useState("");
  const [repositoryScopeChoices, setRepositoryScopeChoices] = useState<RepositoryScopeChoice[]>([]);
  const [toast, setToast] = useState("");
  const [showFullTrace, setShowFullTrace] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  const activeProjectId = projectMode === "sample" ? SAMPLE_PROJECT_ID : WORKSPACE_PROJECT_ID;
  const workspaceEvidenceCount = sources.length + (repository.fileCount ?? 0);
  const sourceLabel = projectMode === "sample"
    ? "Example ready"
    : workspaceEvidenceCount
      ? `Your project · ${workspaceEvidenceCount} source item${workspaceEvidenceCount === 1 ? "" : "s"}`
      : "Your project · add files to begin";
  const canDownloadWorkspaceResults = Boolean(
    hasAnalyzed
    && analysisReceipt?.projectMode === "workspace"
    && workspaceEvidenceCount > 0,
  );
  const showDetailedAnalysis = answer.verdict !== "INSUFFICIENT_EVIDENCE" || answer.evidence.length > 0;
  const visibleChecks = answer.checks.filter((item) => !isGenericMissingCheck(item));

  const projectStats = useMemo(() => [
    { value: answer.entities.length, label: "people and things found" },
    { value: answer.dependencies.length, label: "dependencies found" },
    { value: answer.conflicts.length, label: "conflicts found" },
    { value: answer.evidence.length, label: "sources used" },
  ], [answer]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem("continuity-theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
        return;
      }
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
        ? REVIEWED_EXAMPLE_RECEIPT.timeScope
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
        form.set("documentType", "narrative");
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
        : `${stored} source${stored === 1 ? "" : "s"} stored as project material${ignored ? ` · ${ignored} beyond the 12-file limit were not sent` : ""}`);
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
      commit: "Choosing version…",
      message: "Saving a read-only copy of the relevant files. Repository code is never run.",
    });
    try {
      const response = await fetch("/api/continuity/repositories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: WORKSPACE_PROJECT_ID,
          repository: requestedRepository,
          ref: repositoryRef.trim() || undefined,
          projectScope: repositoryScope || undefined,
        }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok && payload.code === "project_scope_required") {
        const choices = arrayOfRecords(payload.scopes).flatMap((item): RepositoryScopeChoice[] => {
          const id = stringValue(item.id, "");
          if (!id) return [];
          return [{
            id,
            label: stringValue(item.label, id),
            rootPath: stringValue(item.rootPath, "."),
            kind: stringValue(item.kind, "project"),
          }];
        });
        setRepositoryScopeChoices(choices);
        setRepositoryScope(choices[0]?.id ?? "");
        setRepository({
          phase: "attention",
          repository: requestedRepository,
          ref: repositoryRef.trim() || "Default branch",
          commit: stringValue(payload.commitSha, "Nothing saved"),
          message: readMessage(payload) ?? "Choose which project you want Continuity Lab to read.",
        });
        setProjectMode("workspace");
        return;
      }
      if (!response.ok) throw new Error(readMessage(payload) ?? "The repository could not be synchronized.");
      const next = presentRepository(payload);
      if (next) setRepository(next);
      setRepositoryScopeChoices([]);
      setProjectMode("workspace");
      showToast("Repository connected");
    } catch (error) {
      setRepository({
        phase: "attention",
        repository: requestedRepository,
        ref: repositoryRef.trim() || "Default branch",
        commit: "Nothing saved",
        message: error instanceof Error ? error.message : "The repository could not be synchronized.",
      });
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function showReviewedExample(nextQuestion: string = DEFAULT_QUESTION) {
    setProjectMode("sample");
    setQuestion(nextQuestion);
    const receipt = {
      ...REVIEWED_EXAMPLE_RECEIPT,
      question: nextQuestion,
      targetPosition: inferTargetPosition(nextQuestion) ?? (nextQuestion === DEFAULT_QUESTION ? 8 : undefined),
    };
    void analyze(nextQuestion, "demo", receipt);
  }

  function openChatGPTPath(panel: SourcePanel = "mcp") {
    setProjectMode("sample");
    setSourcePanel(panel);
    window.requestAnimationFrame(() => document.getElementById("sources")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("continuity-theme", next);
  }

  function exportTrace() {
    const blob = new Blob([JSON.stringify({ project: activeProjectId, question: analyzedQuestion, answer }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "continuity-lab-results.json";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Results downloaded");
  }

  return (
    <main data-theme={theme}>
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="Continuity Lab home"><img className="brand-logo" src="/continuity-lab-plugin-icon.png" alt=""/><span>Continuity <i>Lab</i></span></a>
        <div className="nav-status"><span className="status-dot"/><span>{sourceLabel}</span></div>
        <div className="nav-actions"><a href="#sources">How it works</a><button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><Icon name={theme === "dark" ? "sun" : "moon"} size={15}/><span>{theme === "dark" ? "Light" : "Dark"}</span></button>{canDownloadWorkspaceResults && <button onClick={exportTrace}><Icon name="download" size={15}/> Download my results</button>}</div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-image" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy-block">
            <div className="eyebrow">Continuity for your longer form narrative projects, grounded in your own materials.</div>
            <h1>Towards a new paradigm in<br/><em>game development and continuity.</em></h1>
            <p>See a reviewed example here, then bring your own script, notes, or public game repository into ChatGPT through the read-only Continuity Lab MCP. Ask what is true, what can happen next, or what else must change—and see the sources behind the answer.</p>
          </div>

          <div className="question-card">
            <div className="demo-context">
              <div><span>DETERMINISTIC WORKED EXAMPLE</span></div>
              <button type="button" onClick={() => { setSourcePanel("sample"); document.getElementById("sources")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><Icon name="branch" size={14}/> Repository selected: Vibe Code Simulator</button>
              <p>In the full story, the Founder promises to pay <b>$47,000</b> for his grandmother&apos;s sight-restoring operation. The playable prototype currently covers Days 7–8 and begins with only $700. The question below asks whether the implemented game can actually reach that promised outcome.</p>
            </div>
            <label htmlFor="continuity-question">Ask the reviewed Vibe Code Simulator snapshot</label>
            <textarea id="continuity-question" value={question} onChange={(event) => setQuestion(event.target.value)} />
            <div className="question-footer">
              <div className={`engine-badge ${engineMode}`}><span/>{engineLabel(engineMode, projectMode, workspaceEvidenceCount > 0)}</div>
              <button className="primary-button" onClick={() => void analyze()} disabled={isAnalyzing || !question.trim()}>{isAnalyzing ? <span className="spinner"/> : <Icon name="arrow" size={18}/>} {isAnalyzing ? "Checking evidence…" : "Ask"}</button>
            </div>
          </div>

          <div className="prompt-row"><span>Example questions</span>{SUGGESTED_QUESTIONS.map((prompt) => <button key={prompt} onClick={() => showReviewedExample(prompt)}>{prompt}</button>)}</div>
        </div>
      </section>

      <section className="sources-section" id="sources">
        <div className="section-intro">
          <div><div className="eyebrow dark">QUICK START</div><h2>How it works</h2><p>Run the deterministic Vibe Code Simulator example here. To use your own material, <button type="button" className="inline-mcp-link" onClick={() => { setSourcePanel("mcp"); window.requestAnimationFrame(() => document.getElementById("sources")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>connect the read-only MCP to ChatGPT</button>, attach a file or name an explicit public GitHub repository, and ask the same evidence-grounded questions in conversation.</p></div>
        </div>

        <div className="pipeline" aria-label="Continuity Lab processing pipeline">
          {["Connect Continuity Lab", "Bring a file or public repository", "Ask and inspect the cited answer"].map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < 2 && <i>→</i>}</div>)}
        </div>

        <div className="source-workspace">
          <div className="source-tabs" role="tablist">
            {(["sample", "upload", "github", "mcp"] as SourcePanel[]).map((tab) => <button key={tab} role="tab" aria-selected={sourcePanel === tab} className={sourcePanel === tab ? "active" : ""} onClick={() => setSourcePanel(tab)}>{tab === "sample" ? "Worked example" : tab === "upload" ? "Try your material" : tab === "github" ? "Try a repository" : "Connect to ChatGPT"}</button>)}
          </div>

          <div className="source-panel">
            {sourcePanel === "sample" && (
              <SamplePanel onAsk={showReviewedExample}/>
            )}
            {sourcePanel === "upload" && (
              <TryMaterialPanel onConnect={() => setSourcePanel("mcp")}/>
            )}
            {sourcePanel === "github" && (
              <TryRepositoryPanel onConnect={() => setSourcePanel("mcp")}/>
            )}
            {sourcePanel === "mcp" && <McpPanel/>}
          </div>
        </div>
      </section>

      <section className={`analysis-section ${hasAnalyzed ? "has-result" : ""}`} id="analysis">
        <div className="section-heading">
          <div><div className="eyebrow dark">ANSWER AND EXPLANATION</div><h2>{hasAnalyzed ? analyzedQuestion : "Your answer will appear here."}</h2></div>
          <div className="section-heading-actions"><span className={`verdict ${answer.tone}`}><span/>{answer.status}</span></div>
        </div>

        {engineMode === "unavailable" && <div className="honesty-banner attention"><strong>Live answer unavailable</strong><span>{analysisReceipt?.projectMode === "sample" ? "The reviewed answer is still available. Add the OpenAI API key in Site settings only if you want to run the same question through GPT-5.6." : "Your material is still stored. Add the OpenAI API key in Site settings to search it and answer with GPT-5.6."}</span></div>}

        <div className="answer-grid">
          <article className="answer-card primary-answer">
            <div className="answer-meta"><span>{verdictLabel(answer.verdict)}</span><span>{answer.confidence} confidence</span><span>{coverageLabel(answer.coverageClosure)}</span><span>{shortRevision(answer.revision)}</span></div>
            <h3>{answer.headline}</h3>
            <p>{answer.summary}</p>
          </article>
          {!showDetailedAnalysis
            ? <div className="focused-route"><strong>More material needed</strong><span>No supporting source was found</span></div>
            : answer.depth === "full" || showFullTrace
            ? <div className="stat-grid">{projectStats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
            : <div className="focused-route"><strong>Focused answer</strong><span>{answer.evidence.length} decisive source{answer.evidence.length === 1 ? "" : "s"}</span></div>}
        </div>

        {!showDetailedAnalysis ? (
          <article className="focused-answer-trace">
            <div><span>WHAT TO DO NEXT</span><strong>Add the missing material, then ask again.</strong><small>Upload the relevant story, rule, code, or test—or connect the public repository that contains it.</small></div>
            <button type="button" onClick={() => document.getElementById("sources")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Add material <Icon name="arrow" size={14}/></button>
          </article>
        ) : answer.depth === "focused" && !showFullTrace ? (
          <article className="focused-answer-trace">
            <div><span>KEY CONTEXT</span><strong>{answer.entities.slice(0, 4).map((entity) => entity.name).join(" · ") || "No person or item was identified confidently"}</strong><small>{answer.evidence.slice(0, 3).map((item) => item.title || item.sourceId).join(" · ") || "No supporting source was found"}</small></div>
            <button type="button" onClick={() => setShowFullTrace(true)}>Show all sources and dependencies <Icon name="arrow" size={14}/></button>
          </article>
        ) : <>
          <div className="inspection-grid">
            <article className="instrument-card dependency-card">
              <div className="card-heading"><div><span>WHAT MUST HAPPEN FIRST</span><h3>Steps, missing links, and effects</h3></div><small>{answer.dependencies.length || answer.path.length} connection{(answer.dependencies.length || answer.path.length) === 1 ? "" : "s"}</small></div>
              <DependencyView dependencies={answer.dependencies} path={answer.path}/>
              {answer.blockers.length > 0 && <div className="blocker-list"><strong>What is stopping it</strong>{answer.blockers.map((item) => <p key={item}><span>!</span>{item}</p>)}</div>}
            </article>

            <article className="instrument-card entity-card">
              <div className="card-heading"><div><span>PEOPLE AND THINGS MENTIONED</span><h3>What the question refers to</h3></div><small>for this question</small></div>
              <div className="entity-list">{answer.entities.length ? answer.entities.map((entity) => <div key={entity.id}><span>{entity.type} · {resolutionLabel(entity.resolution)}</span><strong>{entity.name}</strong><small>{entity.aliases.length ? `Also called: ${entity.aliases.slice(0, 2).join(", ")} · ` : ""}{entity.evidenceIds.length} source{entity.evidenceIds.length === 1 ? "" : "s"}</small></div>) : <EmptyState copy="Ask a question and we will identify the relevant characters, places, events, rules, and items."/>}</div>
            </article>
          </div>

          <div className="inspection-grid lower">
            <article className="instrument-card evidence-card">
              <div className="card-heading"><div><span>SOURCE CHECK</span><h3>Why this is the answer</h3></div><small>{answer.scope}</small></div>
              <div className="evidence-list">{answer.evidence.length ? answer.evidence.map((item) => <details key={item.evidenceId}><summary><span className={`stance ${item.stance}`}>{stanceLabel(item.stance)}</span><span><strong>{item.title || item.sourceId}</strong><code>{item.locator}</code></span><Icon name="arrow" size={14}/></summary><div className="evidence-detail"><p>{item.supports}</p>{item.excerpt && <blockquote>{item.excerpt}</blockquote>}</div></details>) : <EmptyState copy="The files and passages used for the answer will appear here."/>}</div>
            </article>

            <article className="instrument-card repair-card">
              <div className="card-heading"><div><span>NEXT STEPS</span><h3>What to change</h3></div></div>
              {answer.proposal ? <><p className="proposal-summary">{answer.proposal.summary}</p><div className="repair-list">{answer.proposal.requiredChanges.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>)}</div>{answer.proposal.downstreamRisks.length > 0 && <details><summary>What else could be affected</summary>{answer.proposal.downstreamRisks.map((risk) => <p key={risk}>{risk}</p>)}</details>}</> : <EmptyState copy="If something needs to change, the suggested updates will appear here."/>}
            </article>
          </div>

          {visibleChecks.length > 0 && <article className="closure-audit"><div className="card-heading"><div><span>WHAT WE CHECKED</span><h3>Checks behind this answer</h3></div><small>{visibleChecks.filter((item) => item.status === "unknown").length ? `${visibleChecks.filter((item) => item.status === "unknown").length} question${visibleChecks.filter((item) => item.status === "unknown").length === 1 ? "" : "s"} remain` : "No unanswered checks"}</small></div><div className="closure-grid">{visibleChecks.map((item) => <div key={item.check} className={item.status}><span>{checkStatusLabel(item.status)}</span><strong>{checkLabel(item.check)}</strong><p>{checkFinding(item)}</p></div>)}</div></article>}
        </>}

        {answer.conflicts.length > 0 && <div className="conflict-strip"><strong>{answer.conflicts.length} conflict{answer.conflicts.length === 1 ? "" : "s"} found</strong>{answer.conflicts.map((conflict) => <p key={`${conflict.type}-${conflict.statement}`}><span>{conflict.severity}</span>{conflict.statement}</p>)}</div>}
        {answer.followUps.length > 0 && <div className="follow-ups"><span>Ask another question</span>{answer.followUps.slice(0, 3).map((item) => <button key={item} onClick={() => void analyze(item)}>{item}<Icon name="arrow" size={14}/></button>)}</div>}
      </section>

      <section className="build-week-section">
        <div><div className="eyebrow">FROM QUESTION TO ACTION</div><h2>Know what is true.<br/><em>See what comes next.</em></h2><p className="future-intro">Today Continuity Lab answers and traces in read-only mode. The longer-term opportunity is an agent preflight: plan against project truth, make a bounded change, then verify every affected dependency before shipping.</p></div>
        <div className="proof-points"><div><span>01</span><strong>Bring your material</strong><p>Use a script, story bible, notes, or a public repository.</p></div><div><span>02</span><strong>Ask a real question</strong><p>Check a fact, possible event, contradiction, dependency, or planned change.</p></div><div><span>03</span><strong>Get useful next steps</strong><p>See the answer, supporting sources, and work needed to make the idea fit.</p></div><div><span>04 · FUTURE</span><strong>Guide autonomous development</strong><p>Give coding and narrative agents a grounded stop/go contract, then re-check downstream effects after every edit.</p></div></div>
      </section>

      <footer><div className="brand"><img className="brand-logo" src="/continuity-lab-plugin-icon.png" alt=""/><span>Continuity <i>Lab</i></span></div><p>Keep every story change grounded in what came before.</p><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button></footer>
      {toast && <div className="toast"><Icon name="check" size={16}/>{toast}</div>}
    </main>
  );
}

function SamplePanel({ onAsk }: { onAsk: (question?: string) => void }) {
  return <div className="sample-panel"><div className="source-symbol coral"><Icon name="branch" size={23}/></div><div><span className="panel-kicker">WORKED EXAMPLE</span><h3>Vibe Code Simulator</h3><p>The full story promises that the Founder will eventually pay $47,000 for Grandma&apos;s operation. The playable prototype currently covers only Days 7–8, starts with $700, and cannot reach that outcome. This reviewed snapshot also preserves the real portrait mismatch Continuity Lab found, so the demonstration can show the diagnosis, the dependency trace, and the corrected USER_0047 binding as a before-and-after.</p><div className="sample-question-list">{SUGGESTED_QUESTIONS.map((question) => <button key={question} onClick={() => onAsk(question)}>{question}<Icon name="arrow" size={14}/></button>)}</div></div><button className="outline-button" onClick={() => onAsk()}>Show the main answer <Icon name="arrow" size={16}/></button></div>;
}

function TryMaterialPanel({ onConnect }: { onConnect: () => void }) {
  return <div className="try-panel">
    <div className="try-copy"><span className="source-symbol blue"><Icon name="file" size={23}/></span><span className="panel-kicker">TRY WITH YOUR OWN MATERIAL</span><h3>Bring a file into ChatGPT—not into this website.</h3><p>Attach a story bible, script, specification, notes, or Gutenberg text to a ChatGPT conversation with Continuity Lab enabled. ChatGPT selects the question-relevant passages; the MCP checks exact claims, identities, relationships, dependencies, and uncertainty.</p><div className="trust-note"><strong>Your account, your conversation.</strong><p>The public site does not ask for an OpenAI API key and visitors cannot spend the creator&apos;s API credits.</p></div></div>
    <div className="try-guide"><span className="panel-kicker">A GOOD FIRST TEST</span><ol><li><span>1</span><p>Connect Continuity Lab in ChatGPT.</p></li><li><span>2</span><p>Attach a text-based source and ask a focused continuity question.</p></li><li><span>3</span><p>Ask ChatGPT to show the exact evidence and unresolved ambiguities.</p></li></ol><div className="try-prompt"><span>COPY THIS PROMPT</span><p>“Using Continuity Lab, identify the important characters, goals, promises, and dependencies in the attached material. Then tell me what would conflict if I changed the protagonist&apos;s next decision.”</p></div><button className="dark-button" type="button" onClick={onConnect}>Connect Continuity Lab <Icon name="arrow" size={14}/></button></div>
  </div>;
}

function TryRepositoryPanel({ onConnect }: { onConnect: () => void }) {
  return <div className="try-panel">
    <div className="try-copy"><span className="source-symbol ink"><Icon name="branch" size={23}/></span><span className="panel-kicker">TRY A PUBLIC REPOSITORY</span><h3>Ask about a public GitHub repository in ChatGPT.</h3><p>Give ChatGPT an explicit public GitHub URL. Continuity Lab pins one version, finds likely authority files, asks you to choose a project when the repository contains several, and returns bounded excerpts without running repository code.</p><div className="trust-note"><strong>Read-only and deliberately bounded.</strong><p>The public inspector reads a small, question-relevant slice. Private repositories and exhaustive absence claims are intentionally outside this demonstration.</p></div></div>
    <div className="try-guide"><span className="panel-kicker">PUBLIC REPOSITORY PROMPT</span><div className="try-prompt"><span>COPY THIS PROMPT</span><p>“In https://github.com/victortanws/vibe-coder-sim, which sources define Grandma&apos;s operation, and what must happen before the Founder can reach and pay for it? Use Continuity Lab and cite the repository evidence.”</p></div><div className="mcp-safety"><strong>No shared API key</strong><p>ChatGPT supplies the conversational reasoning. The Continuity Lab MCP performs the read-only inspection and verification.</p></div><button className="dark-button" type="button" onClick={onConnect}>Connect Continuity Lab <Icon name="arrow" size={14}/></button></div>
  </div>;
}

function UploadPanel({ sources, isUploading, onChange, onPaste }: { sources: StoredSource[]; isUploading: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onPaste: (text: string) => Promise<boolean> }) {
  const [pastedText, setPastedText] = useState("");
  return <div className="upload-panel"><div className="upload-input-column"><div className="upload-intro"><span className="panel-kicker">ADD PROJECT MATERIAL</span><h3>Upload the sources you want Continuity Lab to reason from.</h3><p>Story bibles, scripts, specifications, notes, and structured records remain source material—not automatically approved canon.</p></div><label className="upload-drop"><input type="file" multiple accept=".txt,.md,.markdown,.json,.yaml,.yml,.xml,.csv,.tsv,.pdf,.doc,.docx,.html,.htm,.pptx" onChange={(event) => void onChange(event)}/><span className="source-symbol blue"><Icon name="upload" size={23}/></span><strong>{isUploading ? "Storing and indexing…" : "Upload up to 12 sources"}</strong><p>TXT, Markdown, JSON, YAML, XML, CSV/TSV, HTML · operator preview: searchable PDF, DOC/DOCX, PPTX · 20 MB each</p><small>PDF/Office upload is allowlisted because its contents are not yet credential-scanned. XLSX, images, scanned/OCR-only PDFs, EPUB, and RTF need a dedicated extractor.</small></label><div className="paste-source"><textarea value={pastedText} onChange={(event) => setPastedText(event.target.value)} placeholder="Or paste a story, summary, cast list, ID table, or notes…"/><button type="button" disabled={isUploading || !pastedText.trim()} onClick={() => void onPaste(pastedText).then((stored) => { if (stored) setPastedText(""); })}>Store pasted text</button></div></div><div className="uploaded-list"><div className="panel-heading"><span>PROJECT SOURCES</span><strong>{sources.length}</strong></div>{sources.length ? sources.slice(0, 5).map((source) => <div key={source.id} title={source.indexError || "Provider indexing does not independently verify complete extraction."}><Icon name="file" size={17}/><span><strong>{source.logicalName || source.originalFilename || source.filename}</strong><small>{formatBytes(source.byteSize)} · {source.documentType} · {source.authority} · {(source.extractionStatus ?? "not_yet_verified").replaceAll("_", " ")}</small></span><em className={source.indexStatus}>{source.indexStatus.replaceAll("_", " ")}</em></div>) : <EmptyState copy="Files you add will appear here with their storage and indexing status. Indexed means searchable; it does not mean every statement has become canon."/>}</div></div>;
}

function GitHubPanel({ repository, repositoryUrl, repositoryRef, repositoryScope, repositoryScopeChoices, setRepositoryUrl, setRepositoryRef, setRepositoryScope, onSubmit }: {
  repository: RepositoryState;
  repositoryUrl: string;
  repositoryRef: string;
  repositoryScope: string;
  repositoryScopeChoices: RepositoryScopeChoice[];
  setRepositoryUrl: (value: string) => void;
  setRepositoryRef: (value: string) => void;
  setRepositoryScope: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const needsScope = repositoryScopeChoices.length > 0;
  return <div className="github-panel">
    <form onSubmit={(event) => void onSubmit(event)}>
      <div className="panel-kicker">CONNECT GITHUB</div>
      <h3>Find the project&apos;s source of truth.</h3>
      <p>Paste a public repository. Continuity Lab looks for likely sources of truth—such as <code>STORY-CANON.md</code>, a story bible, product contract, or decision record—and compares them with relevant code and tests. In the Vibe Code Simulator example, this process found <code>docs/STORY-CANON.md</code>. A filename is a clue, not automatic proof that a file is approved canon.</p>
      <p>If the repository contains more than one product, story, or example, we stop and ask which one you mean. We save that project choice with the exact version, so later questions cannot silently mix material from a neighboring project.</p>
      <label><span>Public repository URL</span><input type="url" placeholder="https://github.com/your-team/your-game" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} required/></label>
      <label><span>Version to use <i>optional</i></span><input aria-describedby="repository-version-hint" placeholder="Current default branch" value={repositoryRef} onChange={(event) => setRepositoryRef(event.target.value)}/><small id="repository-version-hint">A branch, release tag, or commit ID</small></label>
      {needsScope && <label className="repository-scope-choice"><span>Which project do you mean?</span><select value={repositoryScope} onChange={(event) => setRepositoryScope(event.target.value)}>{repositoryScopeChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label} · {choice.rootPath}</option>)}</select><small>Only files inside this project boundary will be saved for questions.</small></label>}
      <button className="dark-button" disabled={repository.phase === "syncing" || !repositoryUrl.trim() || (needsScope && !repositoryScope)}>{repository.phase === "syncing" ? <span className="spinner light"/> : <Icon name="branch" size={17}/>} {repository.phase === "syncing" ? "Connecting…" : needsScope ? "Add selected project" : "Add repository"}</button>
    </form>
    <div className={`repo-receipt ${repository.phase}`}>
      <div className="receipt-head"><span/><strong>{repository.phase === "ready" ? "Repository ready" : repository.phase === "syncing" ? "Connecting repository" : repository.phase === "attention" ? "Needs attention" : "Ready to connect"}</strong></div>
      <dl><div><dt>Repository</dt><dd>{shortRepository(repository.repository)}</dd></div><div><dt>Version</dt><dd>{repository.ref}</dd></div>{repository.projectScope && <div><dt>Project</dt><dd>{repository.projectScope}</dd></div>}<div><dt>Saved copy</dt><dd>{shortCommit(repository.commit)}</dd></div>{typeof repository.fileCount === "number" && <div><dt>Files available</dt><dd>{repository.fileCount}</dd></div>}<div><dt>Access</dt><dd>{repository.capability ? repository.capability.replaceAll("_", " ") : "not connected"}</dd></div></dl>
      <p>{repository.message}</p>
    </div>
  </div>;
}

function McpPanel() {
  const endpoint = "https://continuity-lab-vcs.synthesys.chatgpt.site/api/mcp";
  const [copied, setCopied] = useState(false);
  async function copyEndpoint() {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <div className="mcp-panel"><div><img className="mcp-brand-logo" src="/continuity-lab-plugin-icon.png" alt="Continuity Lab compass-star logo"/><span className="panel-kicker">TRY CONTINUITY LAB TODAY</span><h3>Use Continuity Lab inside a ChatGPT conversation.</h3><p>ChatGPT can call the same five read-only tools while you talk: answer a question, trace dependencies, analyze a proposed change, compile supplied material, or inspect a public GitHub repository.</p><div className="mcp-example"><span>ASK THE WORKED EXAMPLE</span><p>“Trace every dependency required before Grandma&apos;s operation can happen. Include missing links and downstream effects.”</p><small>The MCP returns the same cited entities and dependency chain shown in the worked example above.</small></div><div className="connection-status ready"><strong>Ready to connect</strong><p>This MCP address is public so ChatGPT can reach it. The tools are read-only and do not ask you to paste an OpenAI API key into this site.</p></div></div><div className="connect-guide"><span className="panel-kicker">CONNECT IN FOUR STEPS</span><ol><li><span>1</span><p>In ChatGPT, open <b>Settings → Security and login</b> and turn on <b>Developer mode</b>.</p></li><li><span>2</span><p>Open <b>Settings → Plugins</b>, press <b>+</b>, and create a developer-mode app named Continuity Lab.</p></li><li><span>3</span><p>Paste the MCP address below. After ChatGPT lists the five tools, press <b>Create</b>.</p></li><li><span>4</span><p>Start a new chat, choose <b>+ → More → Continuity Lab</b>, then ask a question normally.</p></li></ol><div className="mcp-endpoint"><span>MCP ADDRESS</span><code>{endpoint}</code><button type="button" onClick={() => void copyEndpoint()}>{copied ? "Copied" : "Copy address"}</button></div><div className="mcp-actions"><a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">Open ChatGPT Plugins <Icon name="arrow" size={14}/></a><a href="https://developers.openai.com/apps-sdk/deploy/connect-chatgpt" target="_blank" rel="noreferrer">Official connection guide <Icon name="arrow" size={14}/></a></div></div></div>;
}

function DependencyView({ dependencies, path }: { dependencies: DependencyEdge[]; path: string[] }) {
  if (dependencies.length) return <div className="dependency-list">{dependencies.slice(0, 7).map((edge, index) => <div key={`${edge.from}-${edge.to}-${index}`} className={edge.status}><strong>{edge.from}</strong><span title={`${edge.claimKind} · ${edge.claimKey}`}><i/>{edge.relation}</span><strong>{edge.to}</strong><em>{edge.claimKind} · {edge.status}</em></div>)}</div>;
  if (path.length) return <div className="path-list">{path.map((item, index) => <div key={`${item}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>)}</div>;
  return <EmptyState copy="Ask a question to see what must happen first, what is missing, and what happens afterward."/>;
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="empty-state"><span>—</span><p>{copy}</p></div>;
}

function engineLabel(mode: EngineMode, projectMode: ProjectMode, hasWorkspaceMaterial: boolean) {
  if (mode === "gpt-5.6-sol") return "GPT-5.6 Sol · live reasoning";
  if (mode === "demonstration") return "Vibe Code Simulator example";
  if (mode === "unavailable") return "Live reasoning needs setup";
  return projectMode === "sample" ? "Example ready" : hasWorkspaceMaterial ? "Your project is ready" : "Add material below";
}

function verdictLabel(verdict: Verdict) {
  const labels: Record<Verdict, string> = {
    SUPPORTED: "Supported by the sources",
    CONFLICT: "Sources disagree",
    AMBIGUOUS: "Needs clarification",
    UNREACHABLE: "Not possible yet",
    INSUFFICIENT_EVIDENCE: "Not enough information",
    PROPOSAL: "Suggested change",
  };
  return labels[verdict];
}

function coverageLabel(closure: UiAnswer["coverageClosure"]) {
  if (closure === "closed") return "full rule list checked";
  if (closure === "partial") return "some sources checked";
  return "available sources checked";
}

function resolutionLabel(resolution: EntityReference["resolution"]) {
  if (resolution === "resolved") return "identified";
  if (resolution === "ambiguous") return "more than one possibility";
  return "possible match";
}

function stanceLabel(stance: EvidenceReference["stance"]) {
  if (stance === "supports") return "supports";
  if (stance === "opposes") return "disagrees";
  return "context";
}

function checkStatusLabel(status: AnalysisCheckFinding["status"]) {
  if (status === "supported") return "confirmed";
  if (status === "conflicted") return "conflict";
  if (status === "not_applicable") return "not needed";
  return "unknown";
}

function checkLabel(check: string) {
  const labels: Record<string, string> = {
    identity_scope: "Who and what this refers to",
    authority_and_lifecycle: "Which sources apply",
    temporal_scope: "When this is true",
    claim_boundary: "What the answer can claim",
    preconditions_and_reachability: "What has to happen first",
    actor_knowledge_and_authorization: "Who knows and who may act",
    resource_conservation: "Where the money or item comes from",
    transition_ordering: "The order of events",
    repeatability_and_idempotency: "What happens if it runs again",
    state_and_asset_compatibility: "Story and visual consistency",
    downstream_consumers: "Later scenes and systems",
    verification_and_unknowns: "Tests and remaining uncertainty",
  };
  return labels[check] ?? check.replaceAll("_", " ");
}

function isGenericMissingCheck(item: AnalysisCheckFinding) {
  return item.status === "unknown"
    && item.evidenceIds.length === 0
    && item.finding.toLowerCase().includes("no evidence for this dimension");
}

function checkFinding(item: AnalysisCheckFinding) {
  if (item.status === "conflicted" || item.status === "unknown") return item.finding;
  if (item.status === "not_applicable") return "This question does not depend on this check.";

  const findings: Record<string, string> = {
    identity_scope: "The relevant people and things were matched to the cited sources.",
    authority_and_lifecycle: "The answer uses the sources that apply to this version of the project.",
    temporal_scope: "The answer states which part and version of the story it describes.",
    claim_boundary: "Current facts, future plans, and suggested changes are kept separate.",
    preconditions_and_reachability: "The required earlier events and missing steps were checked.",
    actor_knowledge_and_authorization: "The answer checks who knows about the event and who is allowed to act.",
    resource_conservation: "Money, items, or other limited resources have an identified source and use.",
    transition_ordering: "The required events are placed in a workable order.",
    repeatability_and_idempotency: "The answer checks what happens on reload or a repeated action.",
    state_and_asset_compatibility: "Story state and visible art or interface state were compared.",
    downstream_consumers: "Later scenes and systems that depend on this result were checked.",
    verification_and_unknowns: "The answer names the tests needed and does not hide remaining uncertainty.",
  };
  return findings[item.check] ?? item.finding;
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
  const status = verdictLabel(verdict).toUpperCase();
  const tone: UiAnswer["tone"] = verdict === "CONFLICT" || verdict === "UNREACHABLE" ? "danger" : verdict === "SUPPORTED" ? "resolved" : "warning";
  const headlines: Record<Verdict, string> = {
    SUPPORTED: "The current sources support this answer.", CONFLICT: "The current sources disagree.", AMBIGUOUS: "This question could mean more than one thing.", UNREACHABLE: "The intended outcome cannot happen in the current version.", INSUFFICIENT_EVIDENCE: "There is not enough information for a confident answer.", PROPOSAL: "The change could work, but other parts must change with it.",
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
  const scopeRecords = [
    asRecord(payload.projectScope),
    asRecord(asRecord(payload.snapshot)?.projectScope),
    newest ? asRecord(asRecord(newest.snapshot)?.projectScope) : null,
  ].filter(Boolean) as Record<string, unknown>[];
  return {
    phase, repository: repository ?? "Connected repository", ref: firstString(records, ["requestedRef", "ref", "branch", "tag"]) ?? "Default branch", commit: commit ?? "Pinned snapshot",
    fileCount: firstNumber(records, ["fileCount", "selectedFileCount", "entries"]), capability: firstString(records, ["capability", "indexStatus"]),
    projectScope: firstString(scopeRecords, ["label", "id"]),
    message: readMessage(payload) ?? (phase === "syncing" ? "The selected files are saved and are being prepared for questions." : "This exact repository version is ready for questions."),
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
  const mode = analysisModeForQuestion(question);
  return { mode, proposedChange: mode === "evaluate_change" ? question : null };
}

function inferTargetPosition(question: string): number | undefined {
  const value = question.match(/\b(?:by|through|before|until)\s+(?:day|chapter|ch|beat|scene|turn|episode|ep|step)[\s_:#-]*(\d+(?:\.\d+)?)\b/i)?.[1];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

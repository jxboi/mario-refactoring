import {useCallback, useEffect, useMemo, useState} from "react";
import type {Project, Stage} from "../types";
import {TASK_STAGES} from "../types";
import type {AutomationRule, AutomationRuleInput, AutomationRun} from "../lib/automations";
import {AUTOMATION_PLACEHOLDERS, DEFAULT_AUTOMATION_MESSAGE, DEFAULT_AUTOMATION_SUBJECT} from "../lib/automations";
import {createAutomationRule, deleteAutomationRule, fetchAutomationRules, fetchAutomationRuns, testAutomationRule, updateAutomationRule} from "../lib/automationApi";

interface Props {
  workspaceId: string;
  projects: Project[];
  isGuest: boolean;
  onClose: () => void;
}

const newDraft = (workspaceId: string): AutomationRuleInput => ({
  workspaceId,
  name: "Task moved notification",
  enabled: true,
  trigger: {type: "task_stage_changed", projectId: null, fromStage: null, toStage: "deployed"},
  action: {type: "email", to: "", subjectTemplate: DEFAULT_AUTOMATION_SUBJECT, messageTemplate: DEFAULT_AUTOMATION_MESSAGE},
});

function toDraft(rule: AutomationRule): AutomationRuleInput {
  return {workspaceId: rule.workspaceId, name: rule.name, enabled: rule.enabled, trigger: {...rule.trigger}, action: {...rule.action}};
}

const stageName = (stage: Stage | null) => stage === null ? "Any stage" : TASK_STAGES.find((candidate) => candidate.id === stage)?.label ?? stage;

export function AutomationManager({workspaceId, projects, isGuest, onClose}: Props) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<AutomationRuleInput>(() => newDraft(workspaceId));
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(!isGuest);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    if (isGuest) return;
    setLoading(true);
    setError(null);
    try { setRules(await fetchAutomationRules(workspaceId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load automations."); }
    finally { setLoading(false); }
  }, [isGuest, workspaceId]);

  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => { setSelectedId(null); setDraft(newDraft(workspaceId)); setRuns([]); }, [workspaceId]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const selected = useMemo(() => rules.find((rule) => rule.id === selectedId) ?? null, [rules, selectedId]);
  const loadRuns = useCallback(async (ruleId: string) => {
    try { setRuns(await fetchAutomationRuns(workspaceId, ruleId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load delivery history."); }
  }, [workspaceId]);

  useEffect(() => {
    if (!selected) { setRuns([]); return; }
    void loadRuns(selected.id);
  }, [selected, loadRuns]);

  useEffect(() => {
    if (!selected) return;
    const active = runs.some((run) => run.status === "pending" || run.status === "queued" || run.status === "retrying");
    if (!active) return;
    const timer = window.setInterval(() => void loadRuns(selected.id), 3000);
    return () => window.clearInterval(timer);
  }, [selected, loadRuns, runs]);

  const choose = (rule: AutomationRule) => { setSelectedId(rule.id); setDraft(toDraft(rule)); setError(null); };
  const create = () => { setSelectedId("new"); setDraft(newDraft(workspaceId)); setRuns([]); setError(null); };
  const save = async () => {
    setSaving(true); setError(null);
    try {
      const saved = selected ? await updateAutomationRule(selected.id, draft) : await createAutomationRule(draft);
      setRules((current) => selected ? current.map((rule) => rule.id === saved.id ? saved : rule) : [...current, saved]);
      setSelectedId(saved.id); setDraft(toDraft(saved));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save automation."); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!selected || !window.confirm(`Delete “${selected.name}”? Delivery history will remain in the audit log.`)) return;
    setSaving(true); setError(null);
    try { await deleteAutomationRule(selected.id); setRules((current) => current.filter((rule) => rule.id !== selected.id)); setSelectedId(null); setRuns([]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete automation."); }
    finally { setSaving(false); }
  };
  const sendTest = async () => {
    if (!selected) return;
    setSaving(true); setError(null);
    try { const run = await testAutomationRule(selected.id); setRuns((current) => [run, ...current]); window.setTimeout(() => void loadRuns(selected.id), 1500); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not queue test email."); }
    finally { setSaving(false); }
  };

  return <div className="modal-veil" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="automation-modal" role="dialog" aria-modal="true" aria-labelledby="automation-title">
      <header className="automation-head"><div><span className="front-kicker">Workspace settings</span><h2 id="automation-title">Automations</h2><p>Run an action when a task changes stage.</p></div><button className="icon-btn" onClick={onClose} aria-label="Close automations">×</button></header>
      {isGuest ? <div className="automation-guest"><span aria-hidden="true">✉</span><h3>Sign in to use automations</h3><p>Email actions run securely from the cloud and need a GitHub-authenticated workspace.</p></div> :
      <div className="automation-layout">
        <aside className="automation-list">
          <button className="btn btn-primary automation-new" onClick={create}>+ New automation</button>
          {loading && <p className="automation-muted">Loading automations…</p>}
          {!loading && !rules.length && <p className="automation-muted">No rules yet. Create one to notify someone when work moves.</p>}
          {rules.map((rule) => <button key={rule.id} className={`automation-rule${selectedId === rule.id ? " active" : ""}`} onClick={() => choose(rule)}>
            <span className={`automation-status${rule.enabled ? " enabled" : ""}`} aria-hidden="true"/><span><strong>{rule.name}</strong><small>{stageName(rule.trigger.fromStage)} → {stageName(rule.trigger.toStage)}</small></span>
          </button>)}
        </aside>
        <div className="automation-detail">
          {selectedId === null ? <div className="automation-empty"><span aria-hidden="true">↗</span><h3>Select an automation</h3><p>Choose a rule to edit it or review recent email runs.</p></div> : <>
            <div className="automation-form-grid">
              <label className="field automation-name"><span className="field-label">Rule name</span><input className="input" value={draft.name} maxLength={80} onChange={(event) => setDraft({...draft, name: event.target.value})}/></label>
              <label className="automation-enable"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({...draft, enabled: event.target.checked})}/><span>Enabled</span></label>
              <label className="field"><span className="field-label">Project</span><select className="input" value={draft.trigger.projectId ?? ""} onChange={(event) => setDraft({...draft, trigger: {...draft.trigger, projectId: event.target.value || null}})}><option value="">Any project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title || "Untitled project"}</option>)}</select></label>
              <label className="field"><span className="field-label">From stage</span><select className="input" value={draft.trigger.fromStage ?? ""} onChange={(event) => setDraft({...draft, trigger: {...draft.trigger, fromStage: (event.target.value || null) as Stage | null}})}><option value="">Any stage</option>{TASK_STAGES.filter((stage) => stage.id !== draft.trigger.toStage).map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
              <label className="field"><span className="field-label">To stage</span><select className="input" value={draft.trigger.toStage} onChange={(event) => { const toStage = event.target.value as Stage; setDraft({...draft, trigger: {...draft.trigger, toStage, fromStage: draft.trigger.fromStage === toStage ? null : draft.trigger.fromStage}}); }}>{TASK_STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
              <label className="field automation-wide"><span className="field-label">Email recipient</span><input className="input" type="email" value={draft.action.to} placeholder="teammate@example.com" onChange={(event) => setDraft({...draft, action: {...draft.action, to: event.target.value}})}/></label>
              <label className="field automation-wide"><span className="field-label">Subject</span><input className="input" value={draft.action.subjectTemplate} maxLength={200} onChange={(event) => setDraft({...draft, action: {...draft.action, subjectTemplate: event.target.value}})}/></label>
              <label className="field automation-wide"><span className="field-label">Message</span><textarea className="input" rows={4} value={draft.action.messageTemplate} maxLength={5000} onChange={(event) => setDraft({...draft, action: {...draft.action, messageTemplate: event.target.value}})}/></label>
            </div>
            <div className="automation-placeholders"><span>Available placeholders</span>{AUTOMATION_PLACEHOLDERS.map((placeholder) => <code key={placeholder}>{`{{${placeholder}}}`}</code>)}</div>
            {error && <div className="automation-error" role="alert">{error}</div>}
            <div className="automation-actions">{selected && <button className="btn btn-danger" disabled={saving} onClick={() => void remove()}>Delete</button>}<span/>{selected && <button className="btn btn-ghost" disabled={saving} onClick={() => void sendTest()}>Send test</button>}<button className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : selected ? "Save changes" : "Create automation"}</button></div>
            {selected && <section className="automation-history"><div className="automation-history-head"><h3>Recent runs</h3><button className="btn btn-ghost" onClick={() => void loadRuns(selected.id)}>Refresh</button></div>{!runs.length ? <p className="automation-muted">No emails have run yet.</p> : <div className="automation-run-list">{runs.map((run) => <article key={run.id} className="automation-run"><span className={`run-badge run-${run.status}`}>{run.status}</span><div><strong>{run.payload.test ? "Test email" : run.payload.taskTitle}</strong><small>{new Date(run.createdAt).toLocaleString()} · {run.payload.to}</small>{run.lastError && <em>{run.lastError}</em>}</div></article>)}</div>}</section>}
          </>}
        </div>
      </div>}
    </section>
  </div>;
}

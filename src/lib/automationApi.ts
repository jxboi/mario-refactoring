import type {AutomationRule, AutomationRuleInput, AutomationRun} from "./automations";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {headers: {Accept: "application/json", ...(init?.body ? {"Content-Type": "application/json"} : {}), ...(init?.headers ?? {})}, ...init});
  const data = await response.json().catch(() => null) as ({error?: string} & T) | null;
  if (!response.ok) throw new Error(data?.error || `Automation request failed (${response.status}).`);
  return data as T;
}

export async function fetchAutomationRules(workspaceId: string): Promise<AutomationRule[]> {
  return (await request<{rules: AutomationRule[]}>(`/api/automations?workspaceId=${encodeURIComponent(workspaceId)}`)).rules;
}

export async function createAutomationRule(input: AutomationRuleInput): Promise<AutomationRule> {
  return (await request<{rule: AutomationRule}>("/api/automations", {method: "POST", body: JSON.stringify(input)})).rule;
}

export async function updateAutomationRule(id: string, input: AutomationRuleInput): Promise<AutomationRule> {
  return (await request<{rule: AutomationRule}>("/api/automations", {method: "PUT", body: JSON.stringify({...input, id})})).rule;
}

export async function deleteAutomationRule(id: string): Promise<void> {
  await request(`/api/automations?id=${encodeURIComponent(id)}`, {method: "DELETE"});
}

export async function testAutomationRule(ruleId: string): Promise<AutomationRun> {
  return (await request<{run: AutomationRun}>("/api/automations-test", {method: "POST", body: JSON.stringify({ruleId})})).run;
}

export async function fetchAutomationRuns(workspaceId: string, ruleId: string): Promise<AutomationRun[]> {
  return (await request<{runs: AutomationRun[]}>(`/api/automation-runs?workspaceId=${encodeURIComponent(workspaceId)}&ruleId=${encodeURIComponent(ruleId)}`)).runs;
}

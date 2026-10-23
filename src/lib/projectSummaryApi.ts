export interface ProjectSummaryResponse { summary: string; }

export async function summariseProject(workspaceId: string, projectId: string): Promise<string> {
  const response = await fetch("/api/project-summary", {
    method: "POST",
    headers: {Accept: "application/json", "Content-Type": "application/json"},
    body: JSON.stringify({workspaceId, projectId}),
  });
  const data = await response.json().catch(() => null) as ProjectSummaryResponse & {error?: string} | null;
  if (!response.ok) throw new Error(data?.error || `Project summary request failed (${response.status}).`);
  if (typeof data?.summary !== "string" || !data.summary.trim()) throw new Error("The AI summary response was empty.");
  return data.summary;
}

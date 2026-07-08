import type {Project} from "./store";

/** Turn a project name into a safe, lowercase file stem. */
function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

/**
 * Serialize a single project to a JSON string. The `items` container key keeps
 * the output round-trippable through the importer.
 */
export function projectToJson(project: Project): string {
  const payload = {
    name: project.name,
    type: project.type,
    exportedAt: new Date().toISOString(),
    items: project.items.filter((item) => item.title.trim() !== ""),
  };
  return JSON.stringify(payload, null, 2);
}

/** Trigger a browser download of the given project as a JSON file. */
export function exportProject(project: Project): void {
  const blob = new Blob([projectToJson(project)], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugifyName(project.name)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

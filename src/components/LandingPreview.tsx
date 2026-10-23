import { useState, type FormEvent, type ReactNode } from "react";

export function LandingIcon({
  name,
  size = 18,
}: {
  name:
    | "arrow"
    | "home"
    | "plus"
    | "check"
    | "close";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    home: (
      <>
        <path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

type Stage = "To do" | "In progress" | "Done";
type PreviewTask = {
  id: number;
  title: string;
  tag: string;
  stage: Stage;
  date: string;
};
const initialTasks: PreviewTask[] = [
  {
    id: 1,
    title: "Collect a little inspiration",
    tag: "Design",
    stage: "To do",
    date: "May 16",
  },
  {
    id: 2,
    title: "Make a plan",
    tag: "Planning",
    stage: "To do",
    date: "May 18",
  },
  {
    id: 3,
    title: "Sketch the homepage",
    tag: "Design",
    stage: "In progress",
    date: "May 20",
  },
  {
    id: 4,
    title: "Write the first draft",
    tag: "Planning",
    stage: "In progress",
    date: "May 22",
  },
  {
    id: 5,
    title: "Find our visual direction",
    tag: "Design",
    stage: "Done",
    date: "May 10",
  },
];
const stages: Stage[] = ["To do", "In progress", "Done"];

export function LandingPreview() {
  const [tasks, setTasks] = useState(initialTasks);
  const [adding, setAdding] = useState<Stage | null>(null);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  function toggleTask(task: PreviewTask) {
    const stage = task.stage === "Done" ? "To do" : "Done";
    setTasks((current) =>
      current.map((item) => item.id === task.id ? { ...item, stage } : item),
    );
    setAnnouncement(`${task.title} moved to ${stage}.`);
  }
  function addTask(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !adding) return;
    const next: PreviewTask = {
      id: Date.now(),
      title: draft.trim(),
      tag: "Planning",
      stage: adding,
      date: "Just added",
    };
    setTasks((current) => [...current, next]);
    setAnnouncement(`${next.title} added to ${adding}.`);
    setDraft("");
    setAdding(null);
  }
  return (
    <section
      id="workspace-preview"
      className="front-preview-section"
      aria-label="Interactive workspace preview"
      tabIndex={-1}
    >
      <div className="front-preview">
        <div className="front-preview-bar">
          <span className="front-breadcrumb">
            <LandingIcon name="home" size={16} />
            <span className="front-crumb-divider">/</span>
            <span>My workspace</span>
          </span>
          <span className="front-example">Example project</span>
        </div>
        <div className="front-preview-body">
          <div className="front-board">
            <div
              className="front-board-scroll"
              role="region"
              aria-label="Example task board, scroll horizontally on small screens"
              tabIndex={0}
            >
              <div className="front-columns">
                {stages.map((stage) => (
                  <section
                    key={stage}
                    className="front-column"
                    aria-label={stage}
                  >
                    <h3>
                      <span
                        className={`front-stage-dot front-stage-${stage.replaceAll(" ", "-").toLowerCase()}`}
                      />
                      {stage}
                      <span className="front-column-count">
                        {
                          tasks.filter((task) => task.stage === stage)
                            .length
                        }
                      </span>
                    </h3>
                    <div className="front-task-list">
                      {tasks
                        .filter((task) => task.stage === stage)
                        .map((task) => (
                          <article
                            className={`front-task ${stage === "Done" ? "front-task-done" : ""}`}
                            key={task.id}
                          >
                            <h4>{task.title}</h4>
                            <span
                              className={`front-tag ${task.tag === "Design" ? "front-tag-design" : "front-tag-planning"} ${stage === "In progress" && task.tag === "Design" ? "front-tag-active" : ""}`}
                            >
                              {task.tag}
                            </span>
                            <div className="front-task-meta">
                              <button
                                type="button"
                                className="front-complete"
                                aria-label={`${stage === "Done" ? "Reopen" : "Complete"} ${task.title}`}
                                aria-pressed={stage === "Done"}
                                onClick={() => toggleTask(task)}
                              >
                                {stage === "Done" && (
                                  <LandingIcon name="check" size={12} />
                                )}
                              </button>
                              <span>{task.date}</span>
                              <span className="front-task-id">
                                {String(task.id).length < 4
                                  ? `CH–${String(task.id).padStart(2, "0")}`
                                  : "NEW"}
                              </span>
                            </div>
                          </article>
                        ))}
                    </div>
                    {adding === stage ? (
                      <form className="front-add-form" onSubmit={addTask}>
                        <label
                          className="front-sr-only"
                          htmlFor="preview-task-name"
                        >
                          Task name
                        </label>
                        <input
                          id="preview-task-name"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          placeholder="What’s the next step?"
                          maxLength={100}
                          autoFocus
                          required
                        />
                        <div>
                          <button type="submit">Add task</button>
                          <button
                            type="button"
                            aria-label="Cancel adding task"
                            onClick={() => {
                              setAdding(null);
                              setDraft("");
                            }}
                          >
                            <LandingIcon name="close" size={16} />
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="front-add-task"
                        aria-label={`Add task to ${stage}`}
                        onClick={() => {
                          setAdding(stage);
                          setDraft("");
                        }}
                      >
                        <LandingIcon name="plus" size={15} />
                        Add task
                      </button>
                    )}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="front-sr-only" role="status">
        {announcement}
      </span>
    </section>
  );
}

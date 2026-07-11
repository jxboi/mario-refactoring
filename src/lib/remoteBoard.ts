import type {BoardState} from "./store";

export interface RemoteBoardSnapshot {
  state: BoardState | null;
  version: number;
  updatedAt: string | null;
}

export class RemoteBoardError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class RemoteBoardConflict extends RemoteBoardError {
  constructor(public readonly remote: RemoteBoardSnapshot) {
    super("Board changed in another session.", 409);
  }
}

function snapshotFrom(value: unknown): RemoteBoardSnapshot {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    state: (data.state ?? null) as BoardState | null,
    version: typeof data.version === "number" ? data.version : 0,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function requestBoard(token: string, init?: RequestInit): Promise<RemoteBoardSnapshot> {
  const res = await fetch("/api/board", {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await parseResponse(res);

  if (res.status === 409 && data && typeof data === "object" && "remote" in data) {
    throw new RemoteBoardConflict(snapshotFrom((data as {remote: unknown}).remote));
  }

  if (!res.ok) {
    const message = data && typeof data === "object" && typeof (data as {error?: unknown}).error === "string" ? ((data as {error: string}).error as string) : `Board sync failed (${res.status}).`;
    throw new RemoteBoardError(message, res.status);
  }

  return snapshotFrom(data);
}

export function fetchRemoteBoard(token: string): Promise<RemoteBoardSnapshot> {
  return requestBoard(token);
}

export function saveRemoteBoard(token: string, state: BoardState, baseVersion: number): Promise<RemoteBoardSnapshot> {
  return requestBoard(token, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({state, baseVersion}),
  });
}

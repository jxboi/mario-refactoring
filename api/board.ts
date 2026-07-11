import {neon} from "@neondatabase/serverless";
import type {IncomingHttpHeaders} from "node:http";

interface ApiRequest extends AsyncIterable<Buffer | string> {
  method?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
  end(body?: string): void;
}

interface GitHubUser {
  id: number;
  login: string;
}

interface BoardRow {
  state: unknown;
  version: number;
  updated_at: string | Date;
}

let query: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

function getQuery() {
  if (!query) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) throw new Error("POSTGRES_URL or DATABASE_URL is required.");
    query = neon(connectionString);
  }
  return query;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getQuery();
    schemaReady = sql`
      create table if not exists boards (
        user_id text primary key,
        state jsonb not null,
        version integer not null default 1,
        updated_at timestamptz not null default now()
      )
    `
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function authenticate(req: ApiRequest): Promise<string> {
  const authorization = headerValue(req.headers, "authorization");
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw Object.assign(new Error("Missing GitHub token."), {status: 401});

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "chisel-board-sync",
    },
  });
  if (!response.ok) throw Object.assign(new Error("Invalid GitHub token."), {status: 401});

  const user = (await response.json()) as Partial<GitHubUser>;
  if (typeof user.id !== "number") throw Object.assign(new Error("Invalid GitHub profile."), {status: 401});
  return `github:${user.id}`;
}

async function readJson(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8"));
    return req.body;
  }

  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

function snapshot(row: BoardRow | undefined) {
  return row
    ? {
        state: row.state,
        version: Number(row.version) || 0,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      }
    : {state: null, version: 0, updatedAt: null};
}

function sendError(res: ApiResponse, status: number, message: string) {
  res.status(status).json({error: message});
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method !== "GET" && req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      sendError(res, 405, "Method not allowed.");
      return;
    }

    const userId = await authenticate(req);
    await ensureSchema();
    const sql = getQuery();

    if (req.method === "GET") {
      const rows = (await sql`select state, version, updated_at from boards where user_id = ${userId} limit 1`) as BoardRow[];
      res.status(200).json(snapshot(rows[0] as BoardRow | undefined));
      return;
    }

    const body = (await readJson(req)) as {state?: unknown; baseVersion?: unknown} | null;
    if (!body || body.state === undefined) {
      sendError(res, 400, "Missing board state.");
      return;
    }

    const baseVersion = typeof body.baseVersion === "number" && Number.isInteger(body.baseVersion) ? body.baseVersion : 0;
    const state = JSON.stringify(body.state);

    if (baseVersion === 0) {
      const inserted = (await sql`
        insert into boards (user_id, state, version, updated_at)
        values (${userId}, ${state}::jsonb, 1, now())
        on conflict (user_id) do nothing
        returning state, version, updated_at
      `) as BoardRow[];
      if (inserted.length > 0) {
        res.status(200).json(snapshot(inserted[0] as BoardRow));
        return;
      }
    } else {
      const updated = (await sql`
        update boards
        set state = ${state}::jsonb,
            version = version + 1,
            updated_at = now()
        where user_id = ${userId}
          and version = ${baseVersion}
        returning state, version, updated_at
      `) as BoardRow[];
      if (updated.length > 0) {
        res.status(200).json(snapshot(updated[0] as BoardRow));
        return;
      }
    }

    const rows = (await sql`select state, version, updated_at from boards where user_id = ${userId} limit 1`) as BoardRow[];
    res.status(409).json({error: "Board changed in another session.", remote: snapshot(rows[0] as BoardRow | undefined)});
  } catch (err) {
    const status = typeof (err as {status?: unknown}).status === "number" ? ((err as {status: number}).status as number) : 500;
    if (status >= 500) console.error(err);
    sendError(res, status, status === 500 ? "Board storage is unavailable." : (err as Error).message);
  }
}

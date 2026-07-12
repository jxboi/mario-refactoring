import type {ApiRequest, ApiResponse} from "./_auth.js";

export interface BodyRequest extends ApiRequest, AsyncIterable<Buffer | string> {
  method?: string;
  body?: unknown;
}

export async function readJson(req: BodyRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8"));
    return req.body;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : null;
}

export function sendError(res: ApiResponse, status: number, message: string) {
  res.status(status).json({error: message});
}

export function errorStatus(error: unknown): number {
  return typeof (error as {status?: unknown})?.status === "number" ? (error as {status: number}).status : 500;
}

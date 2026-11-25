import "@tanstack/react-start/server-only";
import { z } from "zod";

const BASE_URL = "https://api.clickup.com/api/v2";
// A few newer endpoints (moving a task between lists) exist only in v3;
// paths starting "/v3/" go there.
const V3_BASE_URL = "https://api.clickup.com/api";
// ClickUp allows 100 requests/min per token; leave room for the ClickUp app.
const MAX_PER_MINUTE = 80;
const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];

export class ClickUpAuthError extends Error {
	constructor() {
		super("ClickUp token rejected (401). Check CLICKUP_TOKEN.");
	}
}

export class ClickUpError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sliding-window limiter shared by every request this process makes.
const sentAt: number[] = [];
async function throttle() {
	for (;;) {
		const now = Date.now();
		while (sentAt.length && sentAt[0] <= now - 60_000) sentAt.shift();
		if (sentAt.length < MAX_PER_MINUTE) {
			sentAt.push(now);
			return;
		}
		await sleep(sentAt[0] + 60_000 - now + 50);
	}
}

type Query = Record<string, string | number | boolean | undefined>;

export type ClickUpClient = {
	get<T extends z.ZodType>(
		path: string,
		schema: T,
		query?: Query,
	): Promise<z.infer<T>>;
	// Like get, but resolves to null when the resource is gone (404) or no
	// longer visible to this token (401).
	find<T extends z.ZodType>(
		path: string,
		schema: T,
		query?: Query,
	): Promise<z.infer<T> | null>;
	// Writes aren't retried on network errors or 5xx, which could apply them
	// twice.
	post<T extends z.ZodType>(
		path: string,
		schema: T,
		body: unknown,
	): Promise<z.infer<T>>;
	put<T extends z.ZodType>(
		path: string,
		schema: T,
		body: unknown,
	): Promise<z.infer<T>>;
	delete(path: string): Promise<void>;
	readonly requestCount: number;
};

class NotFound extends Error {}

// Responses are parsed with zod schemas that list only the fields we keep, so
// anything else (descriptions, emails, comments) is dropped at the boundary.
// `signal` cancels the client: in-flight and later requests reject at once.
export function createClickUpClient(
	token: string,
	signal?: AbortSignal,
): ClickUpClient {
	let requestCount = 0;

	async function request<T extends z.ZodType>(
		path: string,
		schema: T,
		query: Query,
		allowMissing: boolean,
		write?: { method: "POST" | "PUT" | "DELETE"; body?: unknown },
	): Promise<z.infer<T>> {
		const method = write?.method ?? "GET";
		const body = write?.body;
		const retries = method === "GET" ? RETRY_DELAYS_MS.length : 0;
		const url = new URL(
			(path.startsWith("/v3/") ? V3_BASE_URL : BASE_URL) + path,
		);
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined) url.searchParams.set(k, String(v));
		}

		for (let attempt = 0; ; attempt++) {
			signal?.throwIfAborted();
			await throttle();
			signal?.throwIfAborted();
			requestCount++;
			let res: Response;
			try {
				const timeout = AbortSignal.timeout(30_000);
				res = await fetch(url, {
					method,
					headers: {
						Authorization: token,
						...(body !== undefined && { "Content-Type": "application/json" }),
					},
					body: body === undefined ? undefined : JSON.stringify(body),
					signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
				});
			} catch (err) {
				if (signal?.aborted) throw err;
				if (attempt < retries) {
					await sleep(RETRY_DELAYS_MS[attempt]);
					continue;
				}
				throw new ClickUpError(`${method} ${path} failed: ${String(err)}`);
			}

			if (allowMissing && (res.status === 401 || res.status === 404)) {
				throw new NotFound();
			}
			if (res.status === 401) throw new ClickUpAuthError();
			if (res.status === 429) {
				// X-RateLimit-Reset is a Unix timestamp in seconds.
				const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
				await sleep(
					Math.max(1_000, (reset || Date.now() + 60_000) - Date.now()),
				);
				continue;
			}
			if (res.status >= 500 && attempt < retries) {
				await sleep(RETRY_DELAYS_MS[attempt]);
				continue;
			}
			if (!res.ok) {
				throw new ClickUpError(`${method} ${path} returned ${res.status}`);
			}
			// A DELETE can answer with an empty body.
			const text = await res.text();
			return schema.parse(text ? JSON.parse(text) : {});
		}
	}

	return {
		get: (path, schema, query = {}) => request(path, schema, query, false),
		post: (path, schema, body) =>
			request(path, schema, {}, false, { method: "POST", body }),
		put: (path, schema, body) =>
			request(path, schema, {}, false, { method: "PUT", body }),
		async delete(path) {
			await request(path, z.unknown(), {}, false, { method: "DELETE" });
		},
		async find(path, schema, query = {}) {
			try {
				return await request(path, schema, query, true);
			} catch (err) {
				if (err instanceof NotFound) return null;
				throw err;
			}
		},
		get requestCount() {
			return requestCount;
		},
	};
}

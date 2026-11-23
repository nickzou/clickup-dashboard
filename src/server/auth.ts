import { verify } from "@node-rs/argon2";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { env } from "./env";
import { isLoginBlocked, recordLoginFailure } from "./rate-limit";
import { createSession, destroySession, hasValidSession } from "./session";

export const getAuthState = createServerFn({ method: "GET" }).handler(() => ({
	authenticated: hasValidSession(),
}));

export const login = createServerFn({ method: "POST" })
	.validator(z.object({ password: z.string().min(1).max(256) }))
	.handler(async ({ data }) => {
		// Only Traefik can reach the app, so X-Forwarded-For is trustworthy.
		const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
		if (isLoginBlocked(ip)) {
			return {
				ok: false as const,
				error: "Too many attempts. Try again in a minute.",
			};
		}
		if (!(await verify(env().DASHBOARD_PASSWORD_HASH, data.password))) {
			recordLoginFailure(ip);
			return { ok: false as const, error: "Incorrect password." };
		}
		createSession();
		return { ok: true as const };
	});

export const logout = createServerFn({ method: "POST" }).handler(() => {
	destroySession();
	// A handler returning undefined produces no response in this Start version.
	return { ok: true as const };
});

// Attach to every server function that reads data. Guarding routes alone would
// leave the RPC endpoints open.
export const requireAuth = createMiddleware({ type: "function" }).server(
	({ next }) => {
		if (!hasValidSession()) throw new Error("Unauthorized");
		return next();
	},
);

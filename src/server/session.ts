import "@tanstack/react-start/server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import { env } from "./env";

// A stateless session: the cookie holds an expiry and an HMAC over it.
// Rotating SESSION_SECRET signs every device out.
const COOKIE = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sign(payload: string): string {
	return createHmac("sha256", env().SESSION_SECRET)
		.update(payload)
		.digest("base64url");
}

export function createSession(): void {
	const payload = Buffer.from(
		JSON.stringify({ exp: Date.now() + MAX_AGE_SECONDS * 1000 }),
	).toString("base64url");
	setCookie(COOKIE, `${payload}.${sign(payload)}`, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: MAX_AGE_SECONDS,
	});
}

export function hasValidSession(): boolean {
	const [payload, signature] = getCookie(COOKIE)?.split(".") ?? [];
	if (!payload || !signature) return false;

	const expected = Buffer.from(sign(payload));
	const actual = Buffer.from(signature);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
		return false;
	}

	try {
		const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
		return typeof exp === "number" && exp > Date.now();
	} catch {
		return false;
	}
}

export function destroySession(): void {
	deleteCookie(COOKIE, { path: "/" });
}

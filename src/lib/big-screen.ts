import { useCallback, useEffect, useSyncExternalStore } from "react";

// Big screen view, for a TV or wall display: no sidebar, the desktop layout
// scaled to the screen's width, data refreshing on its own, and the screen
// kept awake. Saved per device, like the theme.

const KEY = "bigScreen";
const ATTR = "data-big-screen";
const listeners = new Set<() => void>();

// Runs before first paint (inlined in <head>), so the sidebar never flashes in.
export const bigScreenInitScript = `(function(){try{if(localStorage.getItem("${KEY}")==="1")document.documentElement.setAttribute("${ATTR}","")}catch(e){}})()`;

export const BIG_SCREEN_REFRESH_MS = 5 * 60 * 1000;

function read(): boolean {
	try {
		return localStorage.getItem(KEY) === "1";
	} catch {
		return false;
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function useBigScreen() {
	const on = useSyncExternalStore(subscribe, read, () => false);
	const setOn = useCallback((next: boolean) => {
		try {
			if (next) localStorage.setItem(KEY, "1");
			else localStorage.removeItem(KEY);
		} catch {}
		document.documentElement.toggleAttribute(ATTR, next);
		for (const l of listeners) l();
	}, []);
	return { on, setOn };
}

// Keeps a TV's screensaver from kicking in while big screen view is on. The
// lock drops whenever the page is hidden, so it's taken again on return.
export function useWakeLock(active: boolean) {
	useEffect(() => {
		if (!active || !("wakeLock" in navigator)) return;
		let lock: WakeLockSentinel | null = null;
		let cancelled = false;
		const acquire = async () => {
			if (document.visibilityState !== "visible") return;
			try {
				const next = await navigator.wakeLock.request("screen");
				if (cancelled) next.release();
				else lock = next;
			} catch {}
		};
		acquire();
		document.addEventListener("visibilitychange", acquire);
		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", acquire);
			lock?.release().catch(() => {});
		};
	}, [active]);
}

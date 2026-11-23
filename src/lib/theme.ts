import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "theme";
const listeners = new Set<() => void>();

// Runs before first paint (inlined in <head>) so the page never flashes the
// wrong theme.
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

function readTheme(): Theme {
	try {
		const t = localStorage.getItem(KEY);
		return t === "light" || t === "dark" ? t : "system";
	} catch {
		return "system";
	}
}

function apply(theme: Theme) {
	const dark =
		theme === "dark" ||
		(theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	const media = matchMedia("(prefers-color-scheme: dark)");
	const onChange = () => {
		apply(readTheme());
		listener();
	};
	media.addEventListener("change", onChange);
	return () => {
		listeners.delete(listener);
		media.removeEventListener("change", onChange);
	};
}

export function useTheme() {
	const theme = useSyncExternalStore(subscribe, readTheme, () => "system");
	const setTheme = useCallback((next: Theme) => {
		try {
			localStorage.setItem(KEY, next);
		} catch {}
		apply(next);
		for (const l of listeners) l();
	}, []);
	return { theme, setTheme };
}

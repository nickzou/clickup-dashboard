import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import { SidebarMenuButton, SidebarMenuItem } from "#/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";
import { getSyncStatus, triggerSync } from "#/server/sync-status";

export const syncStatusKey = ["sync-status"];

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(ms: number) {
	const minutes = Math.round((ms - Date.now()) / 60_000);
	if (minutes > -1) return "just now";
	if (minutes > -60) return relative.format(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (hours > -24) return relative.format(hours, "hour");
	return relative.format(Math.round(hours / 24), "day");
}

// Sync state and a trigger, shared by the sidebar item and the big screen
// header button.
function useSync() {
	const queryClient = useQueryClient();
	const trigger = useServerFn(triggerSync);
	const { data } = useQuery({
		queryKey: syncStatusKey,
		queryFn: () => getSyncStatus(),
		// Poll quickly while a sync runs, slowly otherwise.
		refetchInterval: (q) => (q.state.data?.running ? 3_000 : 60_000),
	});

	async function onSync() {
		const { started } = await trigger();
		if (!started) toast.info("A sync is already running.");
		await queryClient.invalidateQueries({ queryKey: syncStatusKey });
	}

	const running = data?.running;
	const failed = Boolean(data?.tokenRejected || (data?.lastError && !running));
	const label = running
		? running.kind === "backfill"
			? `First sync… ${running.progress.toLocaleString()} tasks`
			: "Syncing…"
		: data?.tokenRejected
			? "ClickUp token rejected"
			: data?.lastError
				? "Last sync failed"
				: data?.lastSuccessAt
					? `Synced ${ago(data.lastSuccessAt)}`
					: "Not synced yet";
	const detail =
		data?.lastError && !running
			? data.lastError.message
			: data
				? `${data.taskCount.toLocaleString()} tasks`
				: undefined;

	return { data, running, failed, label, detail, onSync };
}

export function SyncStatus() {
	const queryClient = useQueryClient();
	const { data, running, failed, label, detail, onSync } = useSync();

	// When a run finishes, refresh every data query so charts pick it up.
	const wasRunning = useRef(false);
	useEffect(() => {
		const running = Boolean(data?.running);
		if (wasRunning.current && !running) {
			void queryClient.invalidateQueries({
				predicate: (q) => q.queryKey[0] !== syncStatusKey[0],
			});
		}
		wasRunning.current = running;
	}, [data?.running, queryClient]);

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				onClick={onSync}
				disabled={Boolean(running)}
				tooltip={detail ? `${label} · ${detail}` : label}
				className="h-auto py-2"
			>
				{failed ? (
					<AlertTriangle className="text-destructive" />
				) : (
					<RefreshCw className={cn(running && "animate-spin")} />
				)}
				<div className="grid min-w-0 text-left leading-tight">
					<span className="truncate text-sm">{label}</span>
					{detail && (
						<span className="truncate text-xs text-muted-foreground">
							{detail}
						</span>
					)}
				</div>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

// Big screen view hides the sidebar, so the header gets a sync button.
export function SyncButton({ className }: { className?: string }) {
	const { running, failed, label, detail, onSync } = useSync();
	const text = detail ? `${label} · ${detail}` : label;
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={text}
					disabled={Boolean(running)}
					onClick={onSync}
					className={className}
				>
					{failed ? (
						<AlertTriangle className="text-destructive" />
					) : (
						<RefreshCw className={cn(running && "animate-spin")} />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}

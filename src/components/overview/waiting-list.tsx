import { ExternalLink } from "lucide-react";
import { formatShortDay, plural } from "#/lib/format";
import { cn } from "#/lib/utils";

type WaitingTask = {
	id: string;
	name: string;
	url: string;
	status: string;
	statusColor: string | null;
	list: string;
	since: string;
	sinceExact: boolean;
	checkIn: string | null;
};

// Tasks waiting on someone else, grouped by status. Nothing here counts
// toward any score; it's a list of things to check in on.
export function WaitingList({
	tasks,
	today,
}: {
	tasks: WaitingTask[];
	today: string;
}) {
	if (tasks.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Nothing waiting on anyone else.
			</p>
		);
	}
	const groups = new Map<string, WaitingTask[]>();
	for (const t of tasks) {
		const group = groups.get(t.status) ?? [];
		group.push(t);
		groups.set(t.status, group);
	}

	return (
		<div className="grid grid-cols-1 gap-4">
			{[...groups].map(([status, items]) => (
				<section key={status} className="grid grid-cols-1 gap-2">
					<h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
						<span
							className="size-2 shrink-0 rounded-full bg-muted-foreground"
							style={
								items[0].statusColor
									? { background: items[0].statusColor }
									: undefined
							}
							aria-hidden
						/>
						{status}
						<span className="tabular-nums">· {items.length}</span>
					</h3>
					<ul className="grid grid-cols-1 gap-2">
						{items.map((t) => (
							<li key={t.id} className="flex items-start gap-3 text-sm">
								<div className="min-w-0 flex-1">
									<a
										href={t.url}
										target="_blank"
										rel="noreferrer"
										className="group inline-flex max-w-full items-center gap-1 hover:underline"
									>
										<span className="truncate">{t.name}</span>
										<ExternalLink
											className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
											aria-hidden
										/>
									</a>
									<p className="truncate text-xs text-muted-foreground">
										{t.list} · {waitedFor(t, today)}
									</p>
								</div>
								<CheckIn day={t.checkIn} today={today} />
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

// Without a recorded status change, all that's known is the last update.
function waitedFor(t: WaitingTask, today: string) {
	const days = daysBetween(t.since, today);
	if (t.sinceExact) {
		return days === 0
			? "waiting since today"
			: `waiting ${plural(days, "day")}`;
	}
	return days === 0 ? "updated today" : `updated ${plural(days, "day")} ago`;
}

function CheckIn({ day, today }: { day: string | null; today: string }) {
	if (!day) {
		return (
			<span className="shrink-0 text-xs text-muted-foreground">
				No check-in
			</span>
		);
	}
	const late = daysBetween(day, today);
	return (
		<span
			className={cn(
				"shrink-0 text-xs tabular-nums",
				late > 0
					? "font-medium text-destructive"
					: late === 0
						? "font-medium"
						: "text-muted-foreground",
			)}
			title="Check-in (due date)"
		>
			{late > 0
				? `Check in · ${plural(late, "day")} late`
				: late === 0
					? "Check in today"
					: late === -1
						? "Tomorrow"
						: formatShortDay(day)}
		</span>
	);
}

function daysBetween(from: string, to: string) {
	return Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
			86_400_000,
	);
}

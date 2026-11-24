import { ExternalLink } from "lucide-react";

type UpcomingTask = {
	id: string;
	name: string;
	url: string;
	status: string;
	statusColor: string | null;
	timeOfDay: {
		name: string | null;
		color: string | null;
		order: number;
	} | null;
	time: string | null;
};

// Only the next few; the header has the full count.
const SHOWN = 6;

// Today's open tasks, already in order, grouped by Time of Day.
export function UpcomingList({ tasks }: { tasks: UpcomingTask[] }) {
	if (tasks.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">Nothing left for today.</p>
		);
	}
	// Grouped by option, in order. A group whose name isn't synced yet goes
	// without a heading.
	const groups: {
		key: string;
		name: string | null;
		color: string | null;
		items: UpcomingTask[];
	}[] = [];
	for (const t of tasks.slice(0, SHOWN)) {
		const key = String(t.timeOfDay?.order ?? "none");
		const group = groups.at(-1);
		if (group?.key === key) group.items.push(t);
		else
			groups.push({
				key,
				name: t.timeOfDay ? t.timeOfDay.name : "Anytime",
				color: t.timeOfDay?.color ?? null,
				items: [t],
			});
	}

	return (
		<div className="grid grid-cols-1 gap-3">
			{groups.map((g) => (
				// A rail in the Time of Day color runs down each group, so it
				// can't be mistaken for the round status dots on the tasks.
				<section
					key={g.key}
					className="grid grid-cols-1 gap-1.5 border-l-2 border-border pl-3"
					style={g.color ? { borderColor: g.color } : undefined}
				>
					{g.name && (
						<h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
							{g.name}
							<span className="tabular-nums">· {g.items.length}</span>
						</h3>
					)}
					<ul className="grid grid-cols-1 gap-1.5">
						{g.items.map((t) => (
							<li key={t.id} className="flex items-center gap-2 text-sm">
								{/* The task's ClickUp status, in its ClickUp color. */}
								<span
									className="size-2 shrink-0 rounded-full bg-muted-foreground"
									style={
										t.statusColor ? { background: t.statusColor } : undefined
									}
									title={t.status}
									role="img"
									aria-label={`Status: ${t.status}`}
								/>
								<a
									href={t.url}
									target="_blank"
									rel="noreferrer"
									className="group inline-flex min-w-0 flex-1 items-center gap-1 hover:underline"
								>
									<span className="truncate">{t.name}</span>
									<ExternalLink
										className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
										aria-hidden
									/>
								</a>
								<TimePill task={t} />
							</li>
						))}
					</ul>
				</section>
			))}
			{tasks.length > SHOWN && (
				<p className="text-xs text-muted-foreground">
					+{tasks.length - SHOWN} more later today
				</p>
			)}
		</div>
	);
}

// The time on the Time of Day option's color; without a time, the option's
// name. One fixed width, sized for the longest time range ("11:30 AM –
// 12:00 PM"), so the column lines up.
function TimePill({ task }: { task: UpcomingTask }) {
	const label = task.time ?? task.timeOfDay?.name;
	if (!label) return null;
	const color = task.timeOfDay?.color;
	return (
		<span
			className="w-36 shrink-0 truncate rounded-md bg-muted px-2 py-0.5 text-center text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums"
			style={color ? { background: color, color: inkOn(color) } : undefined}
		>
			{label}
		</span>
	);
}

// Black or white, whichever reads better on the hex color.
function inkOn(hex: string) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex);
	if (!m) return undefined;
	const n = Number.parseInt(m[1], 16);
	const channel = (c: number) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const luminance =
		0.2126 * channel(n >> 16) +
		0.7152 * channel((n >> 8) & 255) +
		0.0722 * channel(n & 255);
	// Where black and white text have equal contrast.
	return luminance > 0.179 ? "#09090b" : "#ffffff";
}

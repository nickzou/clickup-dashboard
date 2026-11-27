import { plural } from "#/lib/format";

type Counts = {
	completed: number;
	partial: number;
	putOff: number;
	notDone: number;
	excluded: number;
};

const ROWS: {
	key: keyof Counts;
	label: string;
	hint: string;
	color: string;
}[] = [
	{
		key: "completed",
		label: "Completed",
		hint: "1 point each",
		color: "var(--outcome-completed)",
	},
	{
		key: "partial",
		label: "Partial",
		hint: "½ point each",
		color: "var(--outcome-partial)",
	},
	{
		key: "putOff",
		label: "Put off",
		hint: "moved past its due day",
		color: "var(--outcome-put-off)",
	},
	{
		key: "notDone",
		label: "Not done",
		hint: "lowers the rate",
		color: "var(--outcome-not-done)",
	},
	{
		key: "excluded",
		label: "Excluded",
		hint: "skipped, no action needed…",
		color: "var(--outcome-excluded)",
	},
];

// How finished tasks in the range resolved: a 100% bar plus a labeled row per
// outcome, so the numbers never depend on telling colors apart.
export function OutcomeBreakdown({ counts }: { counts: Counts }) {
	const total = ROWS.reduce((n, r) => n + counts[r.key], 0);
	if (total === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Nothing finished in this range.
			</p>
		);
	}
	const visible = ROWS.filter((r) => counts[r.key] > 0);

	return (
		<div className="grid grid-cols-1 gap-4">
			<div
				className="flex h-3 gap-0.5 overflow-hidden rounded-full"
				role="img"
				aria-label={visible
					.map((r) => `${r.label}: ${counts[r.key]}`)
					.join(", ")}
			>
				{visible.map((r) => (
					<div
						key={r.key}
						className="h-full"
						style={{
							width: `${(counts[r.key] / total) * 100}%`,
							background: r.color,
						}}
						title={`${r.label}: ${plural(counts[r.key], "task")}`}
					/>
				))}
			</div>
			<ul className="grid grid-cols-1 gap-2.5">
				{ROWS.map((r) => {
					const n = counts[r.key];
					return (
						<li key={r.key} className="flex items-center gap-2 text-sm">
							<span
								className="size-2.5 shrink-0 rounded-full"
								style={{ background: r.color }}
								aria-hidden
							/>
							<span className="shrink-0">{r.label}</span>
							{/* The hint gives way first, so the count and percent
							    columns line up on every row. */}
							<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
								{r.hint}
							</span>
							<span className="w-12 shrink-0 text-right font-medium tabular-nums">
								{n.toLocaleString()}
							</span>
							<span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
								{Math.round((n / total) * 100)}%
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

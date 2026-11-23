// Completed tasks per space as labeled horizontal bars. Every bar carries its
// value, so there's no axis or tooltip to hunt through.
export function SpaceBreakdown({
	rows,
}: {
	rows: { id: string; name: string; count: number }[];
}) {
	const max = Math.max(1, ...rows.map((r) => r.count));
	return (
		<ul className="grid gap-3">
			{rows.map((r) => (
				<li key={r.id} className="grid gap-1">
					<div className="flex items-baseline justify-between gap-2 text-sm">
						<span className="truncate">{r.name}</span>
						<span className="font-medium tabular-nums">
							{r.count.toLocaleString()}
						</span>
					</div>
					<div className="h-2 rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-chart-1"
							style={{ width: `${(r.count / max) * 100}%` }}
						/>
					</div>
				</li>
			))}
		</ul>
	);
}

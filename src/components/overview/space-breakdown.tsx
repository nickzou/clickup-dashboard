type Row = { id: string; name: string; count: number };

// Completed tasks per space as labeled horizontal bars, each followed by its
// lists. Every bar carries its value, so there's no axis or tooltip to hunt
// through. Lists share the spaces' scale so lengths compare across the card.
export function SpaceBreakdown({ rows }: { rows: (Row & { lists: Row[] })[] }) {
	const max = Math.max(1, ...rows.map((r) => r.count));
	return (
		<ul className="grid gap-4">
			{rows.map((space) => (
				<li key={space.id} className="grid gap-2">
					<Bar row={space} max={max} />
					{space.lists.length > 0 && (
						<ul
							className="ml-1 grid gap-2 border-l pl-3"
							aria-label={`Lists in ${space.name}`}
						>
							{space.lists.map((list) => (
								<li key={list.id}>
									<Bar row={list} max={max} nested />
								</li>
							))}
						</ul>
					)}
				</li>
			))}
		</ul>
	);
}

function Bar({
	row,
	max,
	nested = false,
}: {
	row: Row;
	max: number;
	nested?: boolean;
}) {
	return (
		<div className="grid gap-1">
			<div
				className={
					nested
						? "flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
						: "flex items-baseline justify-between gap-2 text-sm"
				}
			>
				<span className="truncate">{row.name}</span>
				<span className="font-medium tabular-nums">
					{row.count.toLocaleString()}
				</span>
			</div>
			<div
				className={
					nested ? "h-1 rounded-full bg-muted" : "h-2 rounded-full bg-muted"
				}
			>
				<div
					className={
						nested
							? "h-full rounded-full bg-chart-1/60"
							: "h-full rounded-full bg-chart-1"
					}
					style={{ width: `${(row.count / max) * 100}%` }}
				/>
			</div>
		</div>
	);
}

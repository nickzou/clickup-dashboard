import { cn } from "#/lib/utils";

type Due = {
	done: number;
	notDone: number;
	putOff: number;
	open: number;
	total: number;
};

type Row = {
	id: string;
	name: string;
	count: number;
	// Today only: tasks due today by state.
	due?: Due;
};

const DUE_PARTS = [
	{ key: "done", label: "Done", color: "var(--outcome-completed)" },
	{ key: "putOff", label: "Put off", color: "var(--outcome-put-off)" },
	{ key: "notDone", label: "Not done", color: "var(--outcome-not-done)" },
] as const;

// Completed tasks per space, each followed by its lists. Every row carries its
// value, so there's no axis or tooltip to hunt through.
//
// Normally the bars compare completed points across rows, on one scale. On
// Today rows carry due-today counts instead, and each bar becomes that row's
// own progress: done, not done, and the empty track for what's still open.
export function SpaceBreakdown({ rows }: { rows: (Row & { lists: Row[] })[] }) {
	const progress = rows.some((r) => r.due);
	const max = Math.max(1, ...rows.map((r) => r.count));
	// On Today, a total row sums every space so the day's size reads at once.
	const total: Row | null = progress
		? {
				id: "total",
				name: "All tasks",
				count: rows.reduce((n, r) => n + r.count, 0),
				due: rows.reduce<Due>(
					(acc, r) => ({
						done: acc.done + (r.due?.done ?? 0),
						notDone: acc.notDone + (r.due?.notDone ?? 0),
						putOff: acc.putOff + (r.due?.putOff ?? 0),
						open: acc.open + (r.due?.open ?? 0),
						total: acc.total + (r.due?.total ?? 0),
					}),
					{ done: 0, notDone: 0, putOff: 0, open: 0, total: 0 },
				),
			}
		: null;
	return (
		<div className="grid grid-cols-1 gap-4">
			{progress && <Legend />}
			{total && (
				<div className="border-b pb-4 font-semibold">
					<BarRow row={total} max={max} />
				</div>
			)}
			<ul className="grid grid-cols-1 gap-4">
				{rows.map((space) => (
					<li key={space.id} className="grid grid-cols-1 gap-2">
						<BarRow row={space} max={max} />
						{space.lists.length > 0 && (
							<ul
								className="ml-1 grid gap-2 border-l pl-3"
								aria-label={`Lists in ${space.name}`}
							>
								{space.lists.map((list) => (
									<li key={list.id}>
										<BarRow row={list} max={max} nested />
									</li>
								))}
							</ul>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

function Legend() {
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
			{DUE_PARTS.map((p) => (
				<span key={p.key} className="inline-flex items-center gap-1.5">
					<span
						className="size-2.5 rounded-full"
						style={{ background: p.color }}
						aria-hidden
					/>
					{p.label}
				</span>
			))}
			<span className="inline-flex items-center gap-1.5">
				<span className="size-2.5 rounded-full bg-muted" aria-hidden />
				Still open
			</span>
			<span>· bars show tasks due today</span>
		</div>
	);
}

function BarRow({
	row,
	max,
	nested = false,
}: {
	row: Row;
	max: number;
	nested?: boolean;
}) {
	const height = nested ? "h-1.5" : "h-2.5";
	return (
		<div className="grid grid-cols-1 gap-1">
			<div
				className={cn(
					"flex items-baseline gap-2",
					nested ? "text-xs text-muted-foreground" : "text-sm",
				)}
			>
				<span className="truncate">{row.name}</span>
				<span className="ml-auto flex shrink-0 items-baseline gap-2">
					{row.due && (
						<span className="text-xs text-muted-foreground tabular-nums">
							{row.due.total > 0
								? `${row.due.done}/${row.due.total} due`
								: "nothing due today"}
						</span>
					)}
					<span className="font-medium tabular-nums">
						{row.count.toLocaleString()}
					</span>
				</span>
			</div>
			{row.due ? (
				row.due.total > 0 && <ProgressBar due={row.due} height={height} />
			) : (
				<div className={cn(height, "rounded-full bg-muted")}>
					<div
						className={cn(
							"h-full rounded-full",
							nested ? "bg-chart-1/60" : "bg-chart-1",
						)}
						style={{ width: `${(row.count / max) * 100}%` }}
					/>
				</div>
			)}
		</div>
	);
}

function ProgressBar({ due, height }: { due: Due; height: string }) {
	return (
		<div
			className={cn(
				height,
				"flex gap-0.5 overflow-hidden rounded-full bg-muted",
			)}
			role="img"
			aria-label={`${due.done} done, ${due.putOff} put off, ${due.notDone} not done, ${due.open} still open, of ${due.total} due today`}
		>
			{DUE_PARTS.map(
				(p) =>
					due[p.key] > 0 && (
						<div
							key={p.key}
							className="h-full"
							style={{
								width: `${(due[p.key] / due.total) * 100}%`,
								background: p.color,
							}}
							title={`${p.label}: ${due[p.key]}`}
						/>
					),
			)}
		</div>
	);
}

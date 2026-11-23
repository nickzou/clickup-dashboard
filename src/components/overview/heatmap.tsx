import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatLongDay, formatMonth, plural } from "#/lib/format";

type Day = { date: string; count: number };

const CELL = 12;
const GAP = 3;
const LEVELS = [
	"var(--heat-0)",
	"var(--heat-1)",
	"var(--heat-2)",
	"var(--heat-3)",
	"var(--heat-4)",
];

// Level thresholds from the quartiles of non-zero days, so the ramp adapts to
// how many tasks a busy day actually has.
function thresholds(days: Day[]): number[] {
	const counts = days
		.map((d) => d.count)
		.filter((c) => c > 0)
		.sort((a, b) => a - b);
	if (!counts.length) return [1, 1, 1];
	const q = (p: number) => counts[Math.floor((counts.length - 1) * p)];
	return [q(0.25), q(0.5), q(0.75)];
}

function level(count: number, t: number[]) {
	if (count === 0) return 0;
	if (count <= t[0]) return 1;
	if (count <= t[1]) return 2;
	if (count <= t[2]) return 3;
	return 4;
}

export function Heatmap({ days }: { days: Day[] }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<{ day: Day; x: number; y: number }>();
	const t = useMemo(() => thresholds(days), [days]);

	// Days start on a Sunday; chunk into week columns.
	const weeks = useMemo(() => {
		const out: Day[][] = [];
		for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
		return out;
	}, [days]);

	// On narrow screens the grid scrolls; start at the most recent week.
	useLayoutEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollLeft = el.scrollWidth;
	}, []);

	const total = days.reduce((n, d) => n + d.count, 0);
	const active = days.filter((d) => d.count > 0).length;

	return (
		<div className="relative">
			<div ref={scrollRef} className="overflow-x-auto pb-2">
				<div className="flex w-max gap-2">
					<div
						className="grid text-xs text-muted-foreground"
						style={{
							gridTemplateRows: `16px repeat(7, ${CELL}px)`,
							rowGap: GAP,
						}}
						aria-hidden
					>
						<span />
						{["", "Mon", "", "Wed", "", "Fri", ""].map((d, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed list
								key={i}
								className="leading-[12px]"
							>
								{d}
							</span>
						))}
					</div>
					<div
						role="img"
						aria-label={`${plural(total, "task")} completed over the last year, on ${plural(active, "day")}.`}
						className="flex"
						style={{ gap: GAP }}
						onPointerLeave={() => setHover(undefined)}
					>
						{weeks.map((week, wi) => {
							const monthStart = week.find((d) => d.date.endsWith("-01"));
							return (
								<div
									key={week[0].date}
									className="grid"
									style={{
										gridTemplateRows: `16px repeat(7, ${CELL}px)`,
										rowGap: GAP,
									}}
								>
									<span className="relative text-xs text-muted-foreground">
										{(monthStart || wi === 0) && (
											<span className="absolute left-0 whitespace-nowrap">
												{formatMonth((monthStart ?? week[0]).date)}
											</span>
										)}
									</span>
									{week.map((day) => (
										<span
											key={day.date}
											className="rounded-[3px]"
											style={{
												width: CELL,
												height: CELL,
												background: LEVELS[level(day.count, t)],
											}}
											onPointerEnter={(e) => {
												const box = e.currentTarget.getBoundingClientRect();
												const parent =
													scrollRef.current?.parentElement?.getBoundingClientRect();
												if (!parent) return;
												setHover({
													day,
													x: box.left - parent.left + CELL / 2,
													y: box.top - parent.top,
												});
											}}
										/>
									))}
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{hover && (
				<div
					className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
					style={{ left: hover.x, top: hover.y - 6 }}
				>
					<div className="font-medium">{plural(hover.day.count, "task")}</div>
					<div className="text-muted-foreground">
						{formatLongDay(hover.day.date)}
					</div>
				</div>
			)}

			<div className="mt-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
				<span>
					{plural(total, "task")} on {plural(active, "day")}
				</span>
				<span className="flex items-center gap-1" aria-hidden>
					Less
					{LEVELS.map((c) => (
						<span
							key={c}
							className="rounded-[3px]"
							style={{ width: CELL, height: CELL, background: c }}
						/>
					))}
					More
				</span>
			</div>
		</div>
	);
}

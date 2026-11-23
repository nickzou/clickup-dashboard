import {
	Bar,
	BarChart,
	type BarShapeProps,
	CartesianGrid,
	Rectangle,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import { formatLongDay, formatShortDay } from "#/lib/format";

type Point = {
	date: string;
	completed: number;
	partial: number;
	notDone: number;
};

// Bottom to top. Colors match the Outcomes card.
const STACK = ["completed", "partial", "notDone"] as const;

const config = {
	completed: { label: "Completed", color: "var(--outcome-completed)" },
	partial: { label: "Partial", color: "var(--outcome-partial)" },
	notDone: { label: "Not done", color: "var(--outcome-not-done)" },
} satisfies ChartConfig;

// Only the topmost non-empty segment of a stack gets the rounded data-end.
function topOf(p: Point) {
	return [...STACK].reverse().find((k) => p[k] > 0);
}

// Defined once, so re-renders reuse the same shape renderers.
const SHAPES = Object.fromEntries(
	STACK.map((key) => [
		key,
		(props: BarShapeProps) => (
			<Rectangle
				{...props}
				radius={topOf(props.payload as Point) === key ? [4, 4, 0, 0] : 0}
			/>
		),
	]),
) as Record<
	(typeof STACK)[number],
	(props: BarShapeProps) => React.ReactElement
>;

export function CompletionsChart({
	data,
	bucket,
}: {
	data: Point[];
	bucket: "day" | "week";
}) {
	return (
		<ChartContainer config={config} className="aspect-auto h-64 w-full">
			<BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="date"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={24}
					tickFormatter={formatShortDay}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					allowDecimals={false}
					width={32}
				/>
				<ChartTooltip
					cursor={{ fill: "var(--muted)", opacity: 0.6 }}
					content={
						<ChartTooltipContent
							labelFormatter={(_, payload) => {
								const key = payload?.[0]?.payload?.date as string;
								return bucket === "week"
									? `Week of ${formatShortDay(key)}`
									: formatLongDay(key);
							}}
						/>
					}
				/>
				{/* Legend in stack order (Recharts would sort it alphabetically). */}
				<ChartLegend
					content={<ChartLegendContent />}
					itemSorter={(item) =>
						STACK.indexOf(item.dataKey as (typeof STACK)[number])
					}
				/>
				{STACK.map((key) => (
					<Bar
						key={key}
						dataKey={key}
						stackId="outcomes"
						fill={`var(--color-${key})`}
						maxBarSize={24}
						// A thin card-colored edge separates stacked segments.
						stroke="var(--card)"
						strokeWidth={1}
						shape={SHAPES[key]}
						// The grow-in animation kept restarting and left the bars undrawn.
						isAnimationActive={false}
					/>
				))}
			</BarChart>
		</ChartContainer>
	);
}

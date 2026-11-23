import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "#/components/ui/chart";
import {
	formatHour,
	formatHourSpan,
	formatLongDay,
	formatShortDay,
} from "#/lib/format";

const config = {
	count: { label: "Completed", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function CompletionsChart({
	data,
	bucket,
}: {
	data: { date: string; count: number }[];
	bucket: "hour" | "day" | "week";
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
					tickFormatter={bucket === "hour" ? formatHour : formatShortDay}
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
								if (bucket === "hour") return formatHourSpan(key);
								return bucket === "week"
									? `Week of ${formatShortDay(key)}`
									: formatLongDay(key);
							}}
						/>
					}
				/>
				<Bar
					dataKey="count"
					fill="var(--color-count)"
					radius={[4, 4, 0, 0]}
					maxBarSize={24}
				/>
			</BarChart>
		</ChartContainer>
	);
}

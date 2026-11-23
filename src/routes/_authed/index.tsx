import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CloudOff } from "lucide-react";
import { EmptyState } from "#/components/empty-state";
import { CompletionsChart } from "#/components/overview/completions-chart";
import { OverviewFilters } from "#/components/overview/filters";
import { Heatmap } from "#/components/overview/heatmap";
import { KpiTile } from "#/components/overview/kpi-tile";
import { OutcomeBreakdown } from "#/components/overview/outcome-breakdown";
import { SpaceBreakdown } from "#/components/overview/space-breakdown";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { plural } from "#/lib/format";
import { overviewInput, overviewQuery } from "#/server/stats";
import { comparisonLabel, RANGES } from "#/server/stats/ranges";

export const Route = createFileRoute("/_authed/")({
	validateSearch: overviewInput,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(overviewQuery(deps)),
	pendingComponent: OverviewSkeleton,
	component: OverviewPage,
});

function OverviewPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const { data } = useSuspenseQuery(overviewQuery(search));
	const { kpis } = data;
	const range = RANGES[search.range];

	const filters = (
		<OverviewFilters
			range={search.range}
			space={search.space}
			spaces={data.spaces}
			onChange={(next) =>
				navigate({ search: (prev) => ({ ...prev, ...next }), replace: true })
			}
		/>
	);

	if (data.heatmap.every((d) => d.count === 0) && kpis.open === 0) {
		return (
			<div className="grid gap-4">
				{filters}
				<EmptyState
					icon={CloudOff}
					title="No tasks here yet"
					description="Nothing synced for this selection. If this is a fresh install, the first sync may still be running."
				/>
			</div>
		);
	}

	return (
		<div className="grid gap-4 md:gap-6">
			{filters}

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<KpiTile
					label="Completed"
					value={kpis.completed.toLocaleString()}
					delta={{
						current: kpis.completed,
						previous: kpis.completedPrev,
						label: comparisonLabel(search.range, data.today),
					}}
					detail={
						kpis.completionRate === null
							? undefined
							: `${Math.round(kpis.completionRate * 100)}% of resolved tasks done`
					}
				/>
				<KpiTile
					label="Open tasks"
					value={kpis.open.toLocaleString()}
					detail={
						kpis.dueToday
							? `${plural(kpis.dueToday, "task")} due today`
							: "Nothing due today"
					}
				/>
				<KpiTile
					label="Overdue"
					value={kpis.overdue.toLocaleString()}
					detail="Open and past their due date"
					tone={kpis.overdue > 0 ? "critical" : undefined}
				/>
				<KpiTile
					label="Current streak"
					value={plural(kpis.streak, "day")}
					detail={`Best: ${plural(kpis.bestStreak, "day")}`}
				/>
			</div>

			<div className="grid gap-4 md:gap-6 xl:grid-cols-3">
				<Card className="xl:col-span-2">
					<CardHeader>
						<CardTitle>Completions</CardTitle>
						<CardDescription>
							{data.bucket === "hour"
								? "Tasks completed each hour today"
								: `Tasks completed per ${data.bucket} over ${range.text}`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<CompletionsChart data={data.series} bucket={data.bucket} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Outcomes</CardTitle>
						<CardDescription>
							{search.range === "today"
								? "How today's finished tasks resolved"
								: `How finished tasks resolved over ${range.text}`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<OutcomeBreakdown counts={data.outcomes} />
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 md:gap-6 xl:grid-cols-3">
				<Card className="min-w-0 xl:col-span-2">
					<CardHeader>
						<CardTitle>Activity</CardTitle>
						<CardDescription>
							Tasks completed each day, past year
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Heatmap days={data.heatmap} />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>By space</CardTitle>
						<CardDescription>
							{search.range === "today"
								? "Completed today"
								: `Completed over ${range.text}`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{data.bySpace.length ? (
							<SpaceBreakdown rows={data.bySpace} />
						) : (
							<p className="text-sm text-muted-foreground">
								Nothing completed in this range.
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function OverviewSkeleton() {
	return (
		<div className="grid gap-4 md:gap-6">
			<Skeleton className="h-9 w-80 max-w-full" />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{[0, 1, 2, 3].map((i) => (
					<Skeleton key={i} className="h-32 rounded-xl" />
				))}
			</div>
			<Skeleton className="h-80 rounded-xl" />
		</div>
	);
}

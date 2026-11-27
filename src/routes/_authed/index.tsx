import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CloudOff } from "lucide-react";
import { EmptyState } from "#/components/empty-state";
import { CompletionsChart } from "#/components/overview/completions-chart";
import { OverviewFilters } from "#/components/overview/filters";
import { Heatmap } from "#/components/overview/heatmap";
import { KpiFooterStat, KpiTile } from "#/components/overview/kpi-tile";
import { OutcomeBreakdown } from "#/components/overview/outcome-breakdown";
import { SpaceBreakdown } from "#/components/overview/space-breakdown";
import { UpcomingList } from "#/components/overview/upcoming-list";
import { WaitingList } from "#/components/overview/waiting-list";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";
import { BIG_SCREEN_REFRESH_MS, useBigScreen } from "#/lib/big-screen";
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
	const { on: bigScreen } = useBigScreen();
	const { data } = useSuspenseQuery({
		...overviewQuery(search),
		refetchInterval: bigScreen ? BIG_SCREEN_REFRESH_MS : false,
	});
	const { kpis } = data;
	const range = RANGES[search.range];
	const bySpace = data.bySpace.length ? (
		<SpaceBreakdown rows={data.bySpace} />
	) : (
		<p className="text-sm text-muted-foreground">
			Nothing completed in this range.
		</p>
	);

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
			<div className="grid grid-cols-1 gap-4">
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
		<div className="grid grid-cols-1 gap-4 md:gap-6">
			{filters}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] big-screen:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
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
					footer={
						<KpiFooterStat
							label="Overdue"
							value={kpis.overdue.toLocaleString()}
							detail="Open, past due, not waiting on others"
							tone={kpis.overdue > 0 ? "critical" : undefined}
						/>
					}
				/>
				{/* Last from tablet up (full width under the two tiles there, the
				    wide third column from xl); second on phones, where it matters
				    most. */}
				<Card className="gap-3 md:order-last md:col-span-2 xl:col-span-1 big-screen:col-span-1">
					<CardHeader>
						<CardDescription>Upcoming</CardDescription>
						<CardTitle className="text-sm font-normal text-muted-foreground">
							{data.upcoming.length > 0
								? `${data.upcoming.length} left today`
								: "Clear for today"}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<UpcomingList tasks={data.upcoming} />
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

			<div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-3 big-screen:grid-cols-3">
				<Card className="xl:col-span-2 big-screen:col-span-2">
					<CardHeader>
						<CardTitle>Completions</CardTitle>
						<CardDescription>
							{data.bucket === "space"
								? "Completed today, by space"
								: `How each ${data.bucket}'s finished tasks resolved over ${range.text}`}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{data.bucket === "space" ? (
							bySpace
						) : (
							<CompletionsChart data={data.series} bucket={data.bucket} />
						)}
					</CardContent>
				</Card>
				<div className="grid min-w-0 grid-cols-1 content-start gap-4 md:gap-6">
					<Card>
						<CardHeader>
							<CardTitle>
								Waiting on others
								{data.waiting.length > 0 && (
									<span className="ml-2 font-normal text-muted-foreground tabular-nums">
										{data.waiting.length}
									</span>
								)}
							</CardTitle>
							<CardDescription>
								Right now · not counted in any score
							</CardDescription>
						</CardHeader>
						<CardContent>
							<WaitingList tasks={data.waiting} today={data.today} />
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="grid grid-cols-1 items-start gap-4 md:gap-6 xl:grid-cols-3 big-screen:grid-cols-3">
				{/* On Today the Completions card already shows the space breakdown. */}
				<Card
					className={
						data.bucket === "space"
							? "min-w-0 xl:col-span-3 big-screen:col-span-3"
							: "min-w-0 xl:col-span-2 big-screen:col-span-2"
					}
				>
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
				{data.bucket !== "space" && (
					<Card>
						<CardHeader>
							<CardTitle>By space</CardTitle>
							<CardDescription>Completed over {range.text}</CardDescription>
						</CardHeader>
						<CardContent>{bySpace}</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}

function OverviewSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 md:gap-6">
			<Skeleton className="h-9 w-80 max-w-full" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
				{[0, 1].map((i) => (
					<Skeleton key={i} className="h-32 rounded-xl" />
				))}
			</div>
			<Skeleton className="h-80 rounded-xl" />
		</div>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { CloudOff } from "lucide-react";
import { EmptyState } from "#/components/empty-state";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Skeleton } from "#/components/ui/skeleton";

export const Route = createFileRoute("/_authed/")({ component: OverviewPage });

const kpis = ["Completed this week", "Open tasks", "Overdue", "Current streak"];

function OverviewPage() {
	return (
		<div className="grid gap-4 md:gap-6">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{kpis.map((label) => (
					<Card key={label}>
						<CardHeader>
							<CardDescription>{label}</CardDescription>
							<CardTitle className="text-3xl tabular-nums">
								<Skeleton className="h-9 w-16" />
							</CardTitle>
						</CardHeader>
					</Card>
				))}
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Completions</CardTitle>
					<CardDescription>Tasks closed per day</CardDescription>
				</CardHeader>
				<CardContent>
					<EmptyState
						icon={CloudOff}
						title="No ClickUp data yet"
						description="Charts fill in once the first sync from ClickUp has run."
					/>
				</CardContent>
			</Card>
		</div>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { EmptyState } from "#/components/empty-state";

export const Route = createFileRoute("/_authed/throughput")({
	component: () => (
		<EmptyState
			icon={TrendingUp}
			title="Throughput"
			description="Tasks completed per week and month, by space."
		/>
	),
});

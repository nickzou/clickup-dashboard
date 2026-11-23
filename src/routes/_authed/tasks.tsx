import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyState } from "#/components/empty-state";

export const Route = createFileRoute("/_authed/tasks")({
	component: () => (
		<EmptyState
			icon={ListChecks}
			title="Tasks"
			description="Every synced task, filterable and sortable."
		/>
	),
});

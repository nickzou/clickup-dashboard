import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "#/components/empty-state";

export const Route = createFileRoute("/_authed/deadlines")({
	component: () => (
		<EmptyState
			icon={CalendarClock}
			title="Deadlines"
			description="On-time rate, slipped due dates and what's overdue."
		/>
	),
});

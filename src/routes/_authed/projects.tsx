import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { EmptyState } from "#/components/empty-state";

export const Route = createFileRoute("/_authed/projects")({
	component: () => (
		<EmptyState
			icon={FolderKanban}
			title="Projects"
			description="Cycle time and open-task age for your software projects."
		/>
	),
});

import type { LucideIcon } from "lucide-react";

export function EmptyState({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-10 text-center">
			<Icon className="size-8 text-muted-foreground" />
			<h2 className="font-medium">{title}</h2>
			<p className="max-w-sm text-sm text-muted-foreground">{description}</p>
		</div>
	);
}

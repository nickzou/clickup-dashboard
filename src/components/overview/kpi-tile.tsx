import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";

// A small labeled count for a tile's footer, red when it needs attention.
export function KpiFooterStat({
	label,
	value,
	detail,
	tone,
}: {
	label: string;
	value: string;
	detail?: string;
	tone?: "critical";
}) {
	return (
		<div className="flex items-baseline justify-between gap-2 text-sm">
			<div className="grid min-w-0">
				<span className="font-medium">{label}</span>
				{detail && (
					<span className="text-xs text-muted-foreground">{detail}</span>
				)}
			</div>
			<span
				className={cn(
					"text-xl font-semibold tabular-nums",
					tone === "critical" && "text-[#d03b3b]",
				)}
			>
				{value}
			</span>
		</div>
	);
}

export type Delta = { current: number; previous: number; label: string };

export function KpiTile({
	label,
	value,
	detail,
	delta,
	tone,
	footer,
}: {
	label: string;
	value: string;
	detail?: string;
	delta?: Delta;
	// Marks a value that needs attention (e.g. overdue > 0).
	tone?: "critical";
	// A secondary figure under a rule, e.g. Overdue under Completed.
	footer?: ReactNode;
}) {
	return (
		<Card className="gap-2">
			<CardHeader>
				<CardDescription>{label}</CardDescription>
				<CardTitle
					className={cn(
						"text-3xl font-semibold",
						tone === "critical" && "text-[#d03b3b]",
					)}
				>
					{value}
				</CardTitle>
			</CardHeader>
			{(delta || detail) && (
				<CardContent className="grid grid-cols-1 gap-0.5 text-sm text-muted-foreground">
					{delta && <DeltaLine {...delta} />}
					{detail && <span>{detail}</span>}
				</CardContent>
			)}
			{footer && (
				<CardContent className="mt-auto border-t pt-3">{footer}</CardContent>
			)}
		</Card>
	);
}

function DeltaLine({ current, previous, label }: Delta) {
	const diff = current - previous;
	if (diff === 0) {
		return (
			<span className="inline-flex items-center gap-1">
				<Minus className="size-4" aria-hidden /> Same as {label}
			</span>
		);
	}
	const up = diff > 0;
	const pct =
		previous > 0 ? Math.round((Math.abs(diff) / previous) * 100) : null;
	const Icon = up ? ArrowUpRight : ArrowDownRight;
	return (
		<span className="inline-flex items-center gap-1">
			<span
				className={cn(
					"inline-flex items-center gap-0.5 font-medium",
					up
						? "text-[#006300] dark:text-[#0ca30c]"
						: "text-[#d03b3b] dark:text-[#e66767]",
				)}
			>
				<Icon className="size-4" aria-hidden />
				<span className="sr-only">{up ? "Up" : "Down"}</span>
				{up ? "+" : "−"}
				{Math.abs(diff).toLocaleString()}
				{pct !== null && ` (${pct}%)`}
			</span>
			vs {label}
		</span>
	);
}

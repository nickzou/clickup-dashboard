import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";

const RANGE_LABELS = { "30d": "30 days", "90d": "90 days", "12m": "12 months" };
export type RangeKey = keyof typeof RANGE_LABELS;

const ALL = "all";

export function OverviewFilters({
	range,
	space,
	spaces,
	onChange,
}: {
	range: RangeKey;
	space?: string;
	spaces: { id: string; name: string }[];
	onChange: (next: { range?: RangeKey; space?: string | undefined }) => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<ToggleGroup
				type="single"
				variant="outline"
				value={range}
				onValueChange={(v) => v && onChange({ range: v as RangeKey })}
				aria-label="Time range"
			>
				{Object.entries(RANGE_LABELS).map(([key, label]) => (
					<ToggleGroupItem key={key} value={key} className="px-3">
						{label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			<Select
				value={space ?? ALL}
				onValueChange={(v) => onChange({ space: v === ALL ? undefined : v })}
			>
				<SelectTrigger className="w-48" aria-label="Space">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>All spaces</SelectItem>
					{spaces.map((s) => (
						<SelectItem key={s.id} value={s.id}>
							{s.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

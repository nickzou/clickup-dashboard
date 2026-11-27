import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { RANGE_KEYS, RANGES, type RangeKey } from "#/server/stats/ranges";

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
			{/* Seven ranges don't fit a phone's width as buttons; use a menu there. */}
			<Select
				value={range}
				onValueChange={(v) => onChange({ range: v as RangeKey })}
			>
				<SelectTrigger className="w-36 md:hidden" aria-label="Time range">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{RANGE_KEYS.map((key) => (
						<SelectItem key={key} value={key}>
							{RANGES[key].label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<ToggleGroup
				type="single"
				variant="outline"
				value={range}
				onValueChange={(v) => v && onChange({ range: v as RangeKey })}
				aria-label="Time range"
				className="hidden md:flex"
			>
				{RANGE_KEYS.map((key) => (
					<ToggleGroupItem key={key} value={key} className="px-3">
						{RANGES[key].label}
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

import { CalendarIcon, Check, ChevronDown, Clock } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import { Label } from "#/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { cn } from "#/lib/utils";

// Form fields shared by the add and edit task modals. Dates are day keys
// ("YYYY-MM-DD") and times "HH:mm", both in the dashboard's time zone.

export type When = { date: string; time?: string };

// Same rule as ClickUp: compare the times only when both have one.
export function startsAfterDue(start?: When, due?: When) {
	return Boolean(
		start &&
			due &&
			(start.date > due.date ||
				(start.date === due.date &&
					!!start.time &&
					!!due.time &&
					start.time > due.time)),
	);
}

// ClickUp's own status groups, by status type, in its order. Any type it
// adds later lands under Active rather than vanishing.
export const STATUS_GROUPS = [
	{ label: "Not started", types: ["open"] },
	{ label: "Active", types: ["custom"] },
	{ label: "Done", types: ["done"] },
	{ label: "Closed", types: ["closed"] },
];

export function groupOf(type: string) {
	return STATUS_GROUPS.find((g) => g.types.includes(type)) ?? STATUS_GROUPS[1];
}

export type StatusOption = { name: string; color: string | null; type: string };

// A status picker grouped like ClickUp's, each status in its color.
export function StatusSelect({
	id,
	statuses,
	value,
	onChange,
}: {
	id: string;
	statuses: StatusOption[];
	value: string;
	onChange: (v: string) => void;
}) {
	// ClickUp matches status names case-insensitively; select its spelling.
	// Empty, showing the placeholder, when the list has no such status (as
	// after moving to another list).
	const current =
		statuses.find((s) => s.name.toLowerCase() === value.toLowerCase())?.name ??
		"";
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>Status</Label>
			<Select value={current} onValueChange={onChange}>
				<SelectTrigger
					id={id}
					className={cn(
						"w-full",
						current ? "capitalize" : "text-muted-foreground",
					)}
				>
					<SelectValue
						placeholder={statuses.length ? "Pick a status" : "Loading…"}
					/>
				</SelectTrigger>
				<SelectContent>
					{STATUS_GROUPS.map((g) => {
						const items = statuses.filter((s) => groupOf(s.type) === g);
						if (!items.length) return null;
						return (
							<SelectGroup key={g.label}>
								<SelectLabel>{g.label}</SelectLabel>
								{items.map((s) => (
									<SelectItem
										key={s.name}
										value={s.name}
										className="capitalize"
									>
										<span
											className="size-2 rounded-full bg-muted-foreground"
											style={s.color ? { background: s.color } : undefined}
											aria-hidden
										/>
										{s.name}
									</SelectItem>
								))}
							</SelectGroup>
						);
					})}
				</SelectContent>
			</Select>
		</div>
	);
}

export type TimeOfDayOption = {
	id: string;
	name: string;
	color: string | null;
};

// The Time of Day drop-down, with None for unset. Hidden when the field's
// options aren't synced.
export function TimeOfDaySelect({
	id,
	options,
	value,
	onChange,
}: {
	id: string;
	options: TimeOfDayOption[];
	value: string;
	onChange: (v: string) => void;
}) {
	if (!options.length) return null;
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>Time of Day</Label>
			<Select
				value={value || NONE}
				onValueChange={(v) => onChange(v === NONE ? "" : v)}
			>
				<SelectTrigger
					id={id}
					className={cn("w-full", !value && "text-muted-foreground")}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NONE}>None</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.id} value={o.id}>
							<span
								className="size-2 rounded-full bg-muted-foreground"
								style={o.color ? { background: o.color } : undefined}
								aria-hidden
							/>
							{o.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

// A date from a calendar and an optional time, with a clear link once a date
// is set. The time waits for a date; clearing the date clears both.
export function DateTimeField({
	id,
	label,
	date,
	time,
	today,
	onDate,
	onTime,
}: {
	id: string;
	label: string;
	date: string;
	time: string;
	today: string | undefined;
	onDate: (v: string) => void;
	onTime: (v: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected = date ? fromKey(date) : undefined;
	return (
		<div className="grid gap-2">
			<div className="flex h-4 items-center justify-between">
				<Label htmlFor={id}>{label}</Label>
				{date && (
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-foreground"
						onClick={() => {
							onDate("");
							onTime("");
						}}
					>
						Clear
					</button>
				)}
			</div>
			<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							id={id}
							variant="outline"
							className={cn(
								"w-full justify-start px-3 font-normal",
								!date && "text-muted-foreground",
							)}
						>
							<CalendarIcon />
							<span className="truncate">
								{date ? dayLabel(date, today) : "No date"}
							</span>
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						{today && (
							<div className="grid grid-cols-2 gap-2 border-b p-3">
								{[
									{ label: "Today", key: today },
									{ label: "Tomorrow", key: nextDay(today) },
								].map((q) => (
									<Button
										key={q.label}
										type="button"
										size="sm"
										variant={date === q.key ? "secondary" : "outline"}
										onClick={() => {
											onDate(q.key);
											setOpen(false);
										}}
									>
										{q.label}
									</Button>
								))}
							</div>
						)}
						<Calendar
							mode="single"
							selected={selected}
							defaultMonth={selected ?? (today ? fromKey(today) : undefined)}
							today={today ? fromKey(today) : undefined}
							onSelect={(d) => {
								if (d) onDate(toKey(d));
								setOpen(false);
							}}
						/>
					</PopoverContent>
				</Popover>
				<TimePicker
					label={label}
					value={time}
					onChange={onTime}
					disabled={!date}
				/>
			</div>
		</div>
	);
}

// Select needs a value for "nothing picked".
const NONE = "none";

// A searchable time list. Typing narrows it ("930", "9:30p", "2pm"), and a
// time between the 15-minute steps ("9:40") is offered as its own entry.
function TimePicker({
	label,
	value,
	onChange,
	disabled,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const typed = parseTime(query);
	const matches = TIMES.filter((t) => matchesTime(t.value, query));
	const extra =
		typed && !TIMES.some((t) => t.value === typed) ? typed : undefined;

	function pick(v: string) {
		onChange(v);
		setOpen(false);
		setQuery("");
	}

	return (
		<Popover
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setQuery("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					aria-label={`${label} time`}
					disabled={disabled}
					className={cn(
						"w-full justify-start px-3 font-normal",
						!value && "text-muted-foreground",
					)}
				>
					<Clock />
					<span className="truncate">
						{value ? timeLabel(value) : "No time"}
					</span>
					<ChevronDown className="ml-auto opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-52 p-0" align="end">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Type a time…"
						value={query}
						onValueChange={setQuery}
					/>
					<CommandList className="max-h-64">
						<CommandEmpty>No matching time.</CommandEmpty>
						{extra && (
							<CommandItem value={extra} onSelect={() => pick(extra)}>
								{timeLabel(extra)}
							</CommandItem>
						)}
						{!query && (
							<CommandItem value="none" onSelect={() => pick("")}>
								No time
								{!value && <Check className="ml-auto" />}
							</CommandItem>
						)}
						{matches.map((t) => (
							<CommandItem
								key={t.value}
								value={t.value}
								onSelect={() => pick(t.value)}
							>
								{t.label}
								{t.value === value && <Check className="ml-auto" />}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function timeLabel(value: string) {
	const [h, m] = value.split(":").map(Number);
	return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Every 15 minutes, as "HH:mm" values with "9:30 AM" labels.
const TIMES = Array.from({ length: 96 }, (_, i) => {
	const value = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
	return { value, label: timeLabel(value) };
});

// What was typed: its digits, and "a" or "p" if given.
function splitQuery(query: string) {
	const q = query.toLowerCase();
	return {
		digits: q.replace(/\D/g, ""),
		meridiem: /p/.test(q) ? "p" : /a/.test(q) ? "a" : undefined,
	};
}

// A step matches when its 12-hour digits start with the typed ones ("93"
// finds 9:30) and the AM/PM agrees, if typed.
function matchesTime(value: string, query: string) {
	const { digits, meridiem } = splitQuery(query);
	if (!digits && !meridiem) return true;
	const [h, m] = value.split(":").map(Number);
	if (meridiem && (h < 12 ? "a" : "p") !== meridiem) return false;
	return `${h % 12 || 12}${String(m).padStart(2, "0")}`.startsWith(digits);
}

// A complete time from the query ("940", "9:40pm", "21:40"), as "HH:mm".
// Without AM/PM, a 12-hour time reads as the next one from 7 AM on.
function parseTime(query: string) {
	const { digits, meridiem } = splitQuery(query);
	if (digits.length < 3 || digits.length > 4) return undefined;
	let h = Number(digits.slice(0, -2));
	const m = Number(digits.slice(-2));
	if (m > 59 || h > 23 || (meridiem && (h < 1 || h > 12))) return undefined;
	if (meridiem === "p" && h < 12) h += 12;
	else if (meridiem === "a" && h === 12) h = 0;
	else if (!meridiem && h >= 1 && h <= 6) h += 12;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Day keys ("YYYY-MM-DD") to and from local dates for the calendar.
function fromKey(key: string) {
	const [y, m, d] = key.split("-").map(Number);
	return new Date(y, m - 1, d);
}
function toKey(d: Date) {
	return [
		d.getFullYear(),
		String(d.getMonth() + 1).padStart(2, "0"),
		String(d.getDate()).padStart(2, "0"),
	].join("-");
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
	weekday: "short",
	month: "short",
	day: "numeric",
});

function dayLabel(key: string, today: string | undefined) {
	if (key === today) return "Today";
	if (today && key === nextDay(today)) return "Tomorrow";
	return dayFormat.format(fromKey(key));
}

function nextDay(key: string) {
	const d = fromKey(key);
	d.setDate(d.getDate() + 1);
	return toKey(d);
}

export type ListOption = {
	id: string;
	name: string;
	space: string;
	folder: string | null;
};

// Lists grouped by space, folder lists as "Folder › List".
export function ListSelect({
	id,
	lists,
	value,
	onChange,
	className,
}: {
	id: string;
	// Undefined while loading.
	lists: ListOption[] | undefined;
	value: string | undefined;
	onChange: (v: string) => void;
	className?: string;
}) {
	return (
		<div className={cn("grid gap-2", className)}>
			<Label htmlFor={id}>List</Label>
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue placeholder={lists ? "Pick a list" : "Loading…"} />
				</SelectTrigger>
				<SelectContent>
					{groupBySpace(lists ?? []).map(([space, items]) => (
						<SelectGroup key={space}>
							<SelectLabel>{space}</SelectLabel>
							{items.map((l) => (
								<SelectItem key={l.id} value={l.id}>
									{l.folder ? `${l.folder} › ${l.name}` : l.name}
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

function groupBySpace(lists: ListOption[]) {
	const groups = new Map<string, ListOption[]>();
	for (const l of lists) {
		const g = groups.get(l.space);
		if (g) g.push(l);
		else groups.set(l.space, [l]);
	}
	return [...groups];
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarIcon, Check, ChevronDown, Clock, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { syncStatusKey } from "#/components/sync-status";
import { Button } from "#/components/ui/button";
import { Calendar } from "#/components/ui/calendar";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
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
import { Textarea } from "#/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";
import {
	type CaptureList,
	createTask,
	getCaptureLists,
} from "#/server/quick-add";

// Header icon button, from tablet width up.
export function QuickAddButton({ className }: { className?: string }) {
	return (
		<QuickAddDialog>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Add task"
							className={className}
						>
							<Plus />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Add task</TooltipContent>
			</Tooltip>
		</QuickAddDialog>
	);
}

// Full-width button at the top of the page, on phones.
export function QuickAddBar({ className }: { className?: string }) {
	return (
		<QuickAddDialog>
			<DialogTrigger asChild>
				<Button size="lg" className={cn("h-12 w-full text-base", className)}>
					<Plus className="size-5" />
					Add task
				</Button>
			</DialogTrigger>
		</QuickAddDialog>
	);
}

// Quick capture: a name, optional notes, and a list (Routines › Inbox unless
// changed). Assigned to me, so it counts like any other task.
function QuickAddDialog({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{children}
			<DialogContent className="top-[10%] translate-y-0 sm:top-[20%] md:max-w-2xl">
				{open && <QuickAddForm onDone={() => setOpen(false)} />}
			</DialogContent>
		</Dialog>
	);
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
	const queryClient = useQueryClient();
	const create = useServerFn(createTask);
	const { data } = useQuery({
		queryKey: ["capture-lists"],
		queryFn: () => getCaptureLists(),
		staleTime: 5 * 60_000,
	});
	const [name, setName] = useState("");
	const [notes, setNotes] = useState("");
	const [listId, setListId] = useState<string>();
	const [startDate, setStartDate] = useState("");
	const [startTime, setStartTime] = useState("");
	// Due today until changed; "" once cleared.
	const [dueDate, setDueDate] = useState<string>();
	const [dueTime, setDueTime] = useState("");
	// Unset unless picked.
	const [timeOfDay, setTimeOfDay] = useState("");
	const [saving, setSaving] = useState(false);
	const selected = listId ?? data?.defaultId ?? undefined;
	const due = dueDate ?? data?.today ?? "";
	const start = startDate
		? { date: startDate, time: startTime || undefined }
		: undefined;
	const end = due ? { date: due, time: dueTime || undefined } : undefined;
	// Same rule as ClickUp: compare the times only when both have one.
	const backwards =
		start &&
		end &&
		(start.date > end.date ||
			(start.date === end.date &&
				!!start.time &&
				!!end.time &&
				start.time > end.time));

	async function onSubmit(e?: FormEvent) {
		e?.preventDefault();
		if (!name.trim() || !selected || backwards || saving) return;
		setSaving(true);
		try {
			const task = await create({
				data: {
					name,
					notes: notes || undefined,
					listId: selected,
					timeOfDay: timeOfDay || undefined,
					start,
					due: end,
				},
			});
			const list = data?.lists.find((l) => l.id === selected);
			toast.success(`Added to ${list?.name ?? "ClickUp"}`, {
				action: {
					label: "Open",
					onClick: () => window.open(task.url, "_blank", "noreferrer"),
				},
			});
			// Saved locally already; refresh the views that count tasks.
			void queryClient.invalidateQueries({
				predicate: (q) => q.queryKey[0] !== syncStatusKey[0],
			});
			onDone();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Couldn't create the task.",
			);
			setSaving(false);
		}
	}

	return (
		<form
			onSubmit={onSubmit}
			// Cmd/Ctrl+Enter submits from the notes field too.
			onKeyDown={(e) => {
				if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSubmit();
			}}
			className="grid gap-4"
		>
			<DialogHeader>
				<DialogTitle>Add task</DialogTitle>
				<DialogDescription>
					Capture it now, plan it in ClickUp later.
				</DialogDescription>
			</DialogHeader>
			<div className="grid gap-2">
				<Label htmlFor="quick-add-name">Name</Label>
				<Input
					id="quick-add-name"
					autoFocus
					autoComplete="off"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="What's on your mind?"
					maxLength={500}
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="quick-add-notes">Notes</Label>
				<Textarea
					id="quick-add-notes"
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					placeholder="Optional"
					rows={4}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<DateTimeField
					id="quick-add-start"
					label="Start"
					date={startDate}
					time={startTime}
					today={data?.today}
					onDate={setStartDate}
					onTime={setStartTime}
				/>
				<DateTimeField
					id="quick-add-due"
					label="Due"
					date={due}
					time={dueTime}
					today={data?.today}
					onDate={setDueDate}
					onTime={setDueTime}
				/>
				{backwards && (
					<p className="text-sm text-destructive-foreground md:col-span-2">
						The start is after the due date.
					</p>
				)}
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{(data?.timeOfDay.length ?? 0) > 0 && (
					<div className="grid gap-2">
						<Label htmlFor="quick-add-time-of-day">Time of Day</Label>
						<Select
							value={timeOfDay || NONE}
							onValueChange={(v) => setTimeOfDay(v === NONE ? "" : v)}
						>
							<SelectTrigger
								id="quick-add-time-of-day"
								className={cn("w-full", !timeOfDay && "text-muted-foreground")}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>None</SelectItem>
								{data?.timeOfDay.map((o) => (
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
				)}
				<div className="grid gap-2 md:col-start-2">
					<Label htmlFor="quick-add-list">List</Label>
					<Select value={selected} onValueChange={setListId}>
						<SelectTrigger id="quick-add-list" className="w-full">
							<SelectValue placeholder={data ? "Pick a list" : "Loading…"} />
						</SelectTrigger>
						<SelectContent>
							{groupBySpace(data?.lists ?? []).map(([space, items]) => (
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
			</div>
			<DialogFooter>
				<Button
					type="submit"
					disabled={!name.trim() || !selected || backwards || saving}
				>
					{saving ? "Adding…" : "Add task"}
				</Button>
			</DialogFooter>
		</form>
	);
}

// A date from a calendar and an optional time, with a clear link once a date
// is set. The time waits for a date; clearing the date clears both.
function DateTimeField({
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

function groupBySpace(lists: CaptureList[]) {
	const groups = new Map<string, CaptureList[]>();
	for (const l of lists) {
		const g = groups.get(l.space);
		if (g) g.push(l);
		else groups.set(l.space, [l]);
	}
	return [...groups];
}

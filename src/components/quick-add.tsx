import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { syncStatusKey } from "#/components/sync-status";
import {
	DateTimeField,
	ListSelect,
	startsAfterDue,
	TimeOfDaySelect,
} from "#/components/task-fields";
import { Button } from "#/components/ui/button";
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
import { Textarea } from "#/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { cn } from "#/lib/utils";
import { createTask, getCaptureLists } from "#/server/quick-add";

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

// Quick capture: a name, optional notes, and a list (Inbox › Inbox unless
// changed). Assigned to me.
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
	// Due today until changed ("" once cleared), except in the inbox, where
	// captures wait undated until they're processed.
	const [dueDate, setDueDate] = useState<string>();
	const [dueTime, setDueTime] = useState("");
	// Unset unless picked.
	const [timeOfDay, setTimeOfDay] = useState("");
	const [saving, setSaving] = useState(false);
	const selected = listId ?? data?.defaultId ?? undefined;
	// Time of Day is a field of the list's workspace, if it has one.
	const team = data?.lists.find((l) => l.id === selected)?.teamId ?? "";
	const timeOfDayOptions = data?.timeOfDay[team] ?? [];
	const pickedTimeOfDay = timeOfDayOptions.some((o) => o.id === timeOfDay)
		? timeOfDay
		: "";
	const due =
		dueDate ?? (selected === data?.inboxId ? "" : (data?.today ?? ""));
	const start = startDate
		? { date: startDate, time: startTime || undefined }
		: undefined;
	const end = due ? { date: due, time: dueTime || undefined } : undefined;
	const backwards = startsAfterDue(start, end);

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
					timeOfDay: pickedTimeOfDay || undefined,
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
				<TimeOfDaySelect
					id="quick-add-time-of-day"
					options={timeOfDayOptions}
					value={pickedTimeOfDay}
					onChange={setTimeOfDay}
				/>
				<ListSelect
					id="quick-add-list"
					className="md:col-start-2"
					lists={data?.lists}
					value={selected}
					onChange={setListId}
				/>
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

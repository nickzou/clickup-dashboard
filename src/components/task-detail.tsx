import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { syncStatusKey } from "#/components/sync-status";
import {
	DateTimeField,
	ListSelect,
	StatusSelect,
	startsAfterDue,
	TimeOfDaySelect,
	type When,
} from "#/components/task-fields";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
import { Textarea } from "#/components/ui/textarea";
import {
	deleteTask,
	getTaskDetail,
	type TaskDetail,
	updateTask,
} from "#/server/task-edit";
import { getListStatuses } from "#/server/task-status";

type Target = { id: string; name: string; url: string };

// A task's details, editable, fresh from ClickUp. The button beside the close
// X opens the task in ClickUp.
export function TaskDetailDialog({
	task,
	onClose,
}: {
	task: Target | null;
	onClose: () => void;
}) {
	return (
		<Dialog open={task !== null} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="top-[5%] max-h-[90dvh] translate-y-0 overflow-y-auto sm:top-[10%] md:max-w-2xl">
				{task && (
					<>
						<a
							href={task.url}
							target="_blank"
							rel="noreferrer"
							className="absolute top-4 right-11 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
							aria-label="Open in ClickUp"
							title="Open in ClickUp"
						>
							<ExternalLink className="size-4" />
						</a>
						<TaskDetailBody key={task.id} task={task} onClose={onClose} />
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

function TaskDetailBody({
	task,
	onClose,
}: {
	task: Target;
	onClose: () => void;
}) {
	const { data, isError, error } = useQuery({
		queryKey: ["task-detail", task.id],
		queryFn: () => getTaskDetail({ data: { taskId: task.id } }),
		// Always fresh: it may have changed in ClickUp since.
		staleTime: 0,
		gcTime: 0,
	});

	if (isError) {
		return (
			<DialogHeader>
				<DialogTitle className="pr-14">{task.name}</DialogTitle>
				<DialogDescription className="text-destructive-foreground">
					{error instanceof Error ? error.message : "Couldn't load the task."}
				</DialogDescription>
			</DialogHeader>
		);
	}
	if (!data) {
		return (
			<div className="grid gap-4">
				<DialogHeader>
					<DialogTitle className="pr-14">{task.name}</DialogTitle>
					<DialogDescription>Loading from ClickUp…</DialogDescription>
				</DialogHeader>
				<Skeleton className="h-9" />
				<Skeleton className="h-24" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9" />
					<Skeleton className="h-9" />
				</div>
			</div>
		);
	}
	return <TaskEditForm detail={data} onClose={onClose} />;
}

function sameWhen(a: When | null, b: When | null) {
	return (a?.date ?? "") === (b?.date ?? "") && a?.time === b?.time;
}

function TaskEditForm({
	detail,
	onClose,
}: {
	detail: TaskDetail;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const update = useServerFn(updateTask);
	const remove = useServerFn(deleteTask);
	const [name, setName] = useState(detail.name);
	const [description, setDescription] = useState(detail.description);
	const [status, setStatus] = useState(detail.status);
	const [startDate, setStartDate] = useState(detail.start?.date ?? "");
	const [startTime, setStartTime] = useState(detail.start?.time ?? "");
	const [dueDate, setDueDate] = useState(detail.due?.date ?? "");
	const [dueTime, setDueTime] = useState(detail.due?.time ?? "");
	const [timeOfDay, setTimeOfDay] = useState(detail.timeOfDay);
	const [typeId, setTypeId] = useState(detail.typeId);
	const [listId, setListId] = useState(detail.listId);
	const moving = listId !== detail.listId;
	// A move offers the new list's statuses; the current one stays picked if
	// that list has it too.
	const { data: movedStatuses } = useQuery({
		queryKey: ["list-statuses", listId],
		queryFn: () => getListStatuses({ data: { listId } }),
		enabled: moving,
		staleTime: 10 * 60_000,
	});
	const statuses = moving ? (movedStatuses ?? []) : detail.statuses;
	const statusValid = statuses.some(
		(s) => s.name.toLowerCase() === status.toLowerCase(),
	);
	const [busy, setBusy] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const start: When | null = startDate
		? { date: startDate, time: startTime || undefined }
		: null;
	const due: When | null = dueDate
		? { date: dueDate, time: dueTime || undefined }
		: null;
	const backwards = startsAfterDue(start ?? undefined, due ?? undefined);

	// Only what changed goes to ClickUp.
	const changes = {
		...(name.trim() !== detail.name && { name: name.trim() }),
		...(description !== detail.description && { description }),
		// A move always names the status to land in.
		...((moving || status.toLowerCase() !== detail.status.toLowerCase()) && {
			status,
		}),
		...(moving && { listId }),
		...(typeId !== detail.typeId && { typeId }),
		...(!sameWhen(start, detail.start) && { start }),
		...(!sameWhen(due, detail.due) && { due }),
		...(timeOfDay !== detail.timeOfDay && { timeOfDay: timeOfDay || null }),
	};
	const dirty = Object.keys(changes).length > 0;

	function refresh() {
		// Saved locally already; refresh the views that count tasks.
		void queryClient.invalidateQueries({
			predicate: (q) =>
				q.queryKey[0] !== syncStatusKey[0] && q.queryKey[0] !== "task-detail",
		});
	}

	async function onSave(e?: FormEvent) {
		e?.preventDefault();
		if (!dirty || !name.trim() || backwards || !statusValid || busy) return;
		setBusy(true);
		try {
			await update({ data: { taskId: detail.id, changes } });
			toast.success("Saved to ClickUp");
			refresh();
			onClose();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save.");
			setBusy(false);
		}
	}

	async function onDelete() {
		setBusy(true);
		try {
			await remove({ data: { taskId: detail.id } });
			toast.success(`Deleted ${detail.name}`);
			refresh();
			onClose();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't delete.");
			setBusy(false);
		}
	}

	return (
		<form
			onSubmit={onSave}
			// Cmd/Ctrl+Enter saves from the description too.
			onKeyDown={(e) => {
				if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void onSave();
			}}
			className="grid gap-4"
		>
			<DialogHeader>
				<DialogTitle className="pr-14">Task details</DialogTitle>
				<DialogDescription>Changes save to ClickUp.</DialogDescription>
			</DialogHeader>
			<div className="grid gap-2">
				<Label htmlFor="task-name">Name</Label>
				<Input
					id="task-name"
					autoComplete="off"
					value={name}
					onChange={(e) => setName(e.target.value)}
					maxLength={500}
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="task-description">Description</Label>
				<Textarea
					id="task-description"
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="None"
					rows={5}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<StatusSelect
					id="task-status"
					statuses={statuses}
					value={status}
					onChange={setStatus}
				/>
				<div className="grid gap-2">
					<Label htmlFor="task-type">Type</Label>
					<Select
						value={String(typeId)}
						onValueChange={(v) => setTypeId(Number(v))}
					>
						<SelectTrigger id="task-type" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{detail.types.map((t) => (
								<SelectItem key={t.id} value={String(t.id)}>
									{t.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<DateTimeField
					id="task-start"
					label="Start"
					date={startDate}
					time={startTime}
					today={detail.today}
					onDate={setStartDate}
					onTime={setStartTime}
				/>
				<DateTimeField
					id="task-due"
					label="Due"
					date={dueDate}
					time={dueTime}
					today={detail.today}
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
					id="task-time-of-day"
					options={detail.timeOfDayOptions}
					value={timeOfDay}
					onChange={setTimeOfDay}
				/>
				<ListSelect
					id="task-list"
					className="md:col-start-2"
					lists={detail.lists}
					value={listId}
					onChange={setListId}
				/>
				{moving && !statusValid && movedStatuses && (
					<p className="text-sm text-muted-foreground md:col-span-2">
						That list has no “{status}” status. Pick one above.
					</p>
				)}
			</div>
			<DialogFooter className="items-center gap-2 sm:justify-between">
				{confirmDelete ? (
					<div className="flex items-center gap-2">
						<span className="text-sm">Delete this task in ClickUp?</span>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							disabled={busy}
							onClick={onDelete}
						>
							Delete
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={busy}
							onClick={() => setConfirmDelete(false)}
						>
							Cancel
						</Button>
					</div>
				) : (
					<Button
						type="button"
						variant="ghost"
						className="text-destructive-foreground hover:text-destructive-foreground"
						disabled={busy}
						onClick={() => setConfirmDelete(true)}
					>
						<Trash2 />
						Delete task
					</Button>
				)}
				<Button
					type="submit"
					disabled={!dirty || !name.trim() || backwards || !statusValid || busy}
				>
					{busy ? "Saving…" : "Save changes"}
				</Button>
			</DialogFooter>
		</form>
	);
}

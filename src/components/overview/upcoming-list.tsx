import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ExternalLink, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TaskDetailDialog } from "#/components/task-detail";
import { groupOf, STATUS_GROUPS } from "#/components/task-fields";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useBigScreen } from "#/lib/big-screen";
import { getListStatuses, setTaskStatus } from "#/server/task-status";

type UpcomingTask = {
	id: string;
	name: string;
	url: string;
	status: string;
	statusColor: string | null;
	listId: string;
	meeting: boolean;
	timeOfDay: {
		name: string | null;
		color: string | null;
		order: number;
	} | null;
	time: string | null;
};

// Only the next few; the header has the full count.
const SHOWN = 6;

// Today's open tasks, already in order, grouped by Time of Day.
export function UpcomingList({ tasks }: { tasks: UpcomingTask[] }) {
	const { on: bigScreen } = useBigScreen();
	const [editing, setEditing] = useState<UpcomingTask | null>(null);
	if (tasks.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">Nothing left for today.</p>
		);
	}
	// Grouped by option, in order. A group whose name isn't synced yet goes
	// without a heading.
	const groups: {
		key: string;
		name: string | null;
		color: string | null;
		items: UpcomingTask[];
	}[] = [];
	for (const t of tasks.slice(0, SHOWN)) {
		const key = String(t.timeOfDay?.order ?? "none");
		const group = groups.at(-1);
		if (group?.key === key) group.items.push(t);
		else
			groups.push({
				key,
				name: t.timeOfDay ? t.timeOfDay.name : "Anytime",
				color: t.timeOfDay?.color ?? null,
				items: [t],
			});
	}

	return (
		<div className="grid grid-cols-1 gap-3">
			{groups.map((g) => (
				// A rail in the Time of Day color runs down each group, so it
				// can't be mistaken for the round status dots on the tasks.
				<section
					key={g.key}
					className="grid grid-cols-1 gap-1.5 border-l-2 border-border pl-3"
					style={g.color ? { borderColor: g.color } : undefined}
				>
					{g.name && (
						<h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase">
							{g.name}
							<span className="tabular-nums">· {g.items.length}</span>
						</h3>
					)}
					<ul className="grid grid-cols-1 gap-1.5">
						{g.items.map((t) => (
							<li key={t.id} className="flex items-center gap-2 text-sm">
								<StatusMark task={t} />
								{bigScreen ? (
									<a
										href={t.url}
										target="_blank"
										rel="noreferrer"
										className="group inline-flex min-w-0 flex-1 items-center gap-1 hover:underline"
									>
										<span className="truncate">{t.name}</span>
										<ExternalLink
											className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
											aria-hidden
										/>
									</a>
								) : (
									// Opens the task's details to view and edit.
									<button
										type="button"
										onClick={() => setEditing(t)}
										className="min-w-0 flex-1 truncate rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
									>
										{t.name}
									</button>
								)}
								<TimePill task={t} />
							</li>
						))}
					</ul>
				</section>
			))}
			{tasks.length > SHOWN && (
				<p className="text-xs text-muted-foreground">
					+{tasks.length - SHOWN} more later today
				</p>
			)}
			{!bigScreen && (
				<TaskDetailDialog task={editing} onClose={() => setEditing(null)} />
			)}
		</div>
	);
}

// The task's ClickUp status, in its ClickUp color: a dot, or a people icon
// for meetings. One fixed slot, so titles line up. Outside big screen view it
// opens a menu to move the task to another of its list's statuses.
function StatusMark({ task }: { task: UpcomingTask }) {
	const { on: bigScreen } = useBigScreen();
	const [open, setOpen] = useState(false);
	const label = task.meeting
		? `Meeting, status: ${task.status}`
		: `Status: ${task.status}`;
	const mark = task.meeting ? (
		<Users
			className="size-3.5 text-muted-foreground"
			style={task.statusColor ? { color: task.statusColor } : undefined}
			aria-hidden
		/>
	) : (
		<span
			className="size-2 rounded-full bg-muted-foreground"
			style={task.statusColor ? { background: task.statusColor } : undefined}
		/>
	);

	if (bigScreen) {
		return (
			<span
				className="flex size-3.5 shrink-0 items-center justify-center"
				title={task.meeting ? `Meeting · ${task.status}` : task.status}
				role="img"
				aria-label={label}
			>
				{mark}
			</span>
		);
	}
	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				className="-m-1 flex size-5.5 shrink-0 items-center justify-center rounded-sm p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
				aria-label={`${label}. Change status`}
				title={`${task.meeting ? "Meeting · " : ""}${task.status} · change status`}
			>
				{mark}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{open && <StatusOptions task={task} onDone={() => setOpen(false)} />}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function StatusOptions({
	task,
	onDone,
}: {
	task: UpcomingTask;
	onDone: () => void;
}) {
	const queryClient = useQueryClient();
	const setStatus = useServerFn(setTaskStatus);
	const { data, isError } = useQuery({
		queryKey: ["list-statuses", task.listId],
		queryFn: () => getListStatuses({ data: { listId: task.listId } }),
		staleTime: 10 * 60_000,
	});

	async function pick(status: string) {
		onDone();
		if (status.toLowerCase() === task.status.toLowerCase()) return;
		try {
			await setStatus({ data: { taskId: task.id, status } });
			toast.success(`${task.name} → ${status}`);
			void queryClient.invalidateQueries({ queryKey: ["overview"] });
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Couldn't change the status.",
			);
		}
	}

	return (
		<>
			<DropdownMenuLabel className="truncate">{task.name}</DropdownMenuLabel>
			<DropdownMenuSeparator />
			{isError ? (
				<DropdownMenuItem disabled>Couldn't load statuses</DropdownMenuItem>
			) : !data ? (
				<DropdownMenuItem disabled>Loading…</DropdownMenuItem>
			) : (
				STATUS_GROUPS.map((g) => {
					const items = data.filter((s) => groupOf(s.type) === g);
					if (!items.length) return null;
					return (
						<DropdownMenuGroup key={g.label}>
							<DropdownMenuLabel className="pt-2 pb-1 text-xs font-medium text-muted-foreground">
								{g.label}
							</DropdownMenuLabel>
							{items.map((s) => (
								<DropdownMenuItem key={s.name} onSelect={() => pick(s.name)}>
									<span
										className="size-2 shrink-0 rounded-full bg-muted-foreground"
										style={s.color ? { background: s.color } : undefined}
										aria-hidden
									/>
									<span className="truncate capitalize">{s.name}</span>
									{s.name.toLowerCase() === task.status.toLowerCase() && (
										<Check className="ml-auto" />
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					);
				})
			)}
		</>
	);
}

// The time on the Time of Day option's color; without a time, the option's
// name. One fixed width, sized for the longest time range ("11:30 AM –
// 12:00 PM"), so the column lines up.
function TimePill({ task }: { task: UpcomingTask }) {
	const label = task.time ?? task.timeOfDay?.name;
	if (!label) return null;
	const color = task.timeOfDay?.color;
	return (
		<span
			className="w-36 shrink-0 truncate rounded-md bg-muted px-2 py-0.5 text-center text-xs font-medium whitespace-nowrap text-muted-foreground tabular-nums"
			style={color ? { background: color, color: inkOn(color) } : undefined}
		>
			{label}
		</span>
	);
}

// Black or white, whichever reads better on the hex color.
function inkOn(hex: string) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex);
	if (!m) return undefined;
	const n = Number.parseInt(m[1], 16);
	const channel = (c: number) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const luminance =
		0.2126 * channel(n >> 16) +
		0.7152 * channel((n >> 8) & 255) +
		0.0722 * channel(n & 255);
	// Where black and white text have equal contrast.
	return luminance > 0.179 ? "#09090b" : "#ffffff";
}

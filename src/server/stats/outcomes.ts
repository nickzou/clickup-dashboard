// What a finished task's status means for the stats. Status names are
// ClickUp's, matched case-insensitively. A done/closed status not listed here
// counts as completed, like ClickUp's own grouping.

export type Outcome = "completed" | "partial" | "notDone" | "excluded";

const STATUS_OUTCOMES: Record<string, Outcome> = {
	// The work happened.
	complete: "completed",
	done: "completed",
	shipped: "completed",
	purchased: "completed",
	went: "completed",
	active: "completed",
	promoted: "completed",

	// Some of it happened.
	"cut short": "partial",
	"partially completed": "partial",

	// Resolved without doing it: lowers the completion rate.
	"did not complete": "notDone",
	"did not do": "notDone",
	"did not purchase": "notDone",
	"missed it": "notDone",
	cancelled: "notDone",

	// Neither credit nor fault: ignored by every stat.
	"no action required": "excluded",
	archived: "excluded",
	parked: "excluded",
	"hold on": "excluded",
	"last minute switched": "excluded",
	"illness skipped": "excluded",
	"vacation skipped": "excluded",
	"rest skipped": "excluded",
	"social skipped": "excluded",
};

// Open statuses where the next step is someone else's: waiting on feedback,
// a delivery, a blocker. Moving these isn't putting them off, and they don't
// count toward what's due today.
const WAITING = new Set([
	"waiting for feedback",
	"watching",
	"roadblocked",
	"scheduled for delivery",
]);

export function isWaiting(status: string): boolean {
	return WAITING.has(status.toLowerCase());
}

export const POINTS: Record<Outcome, number> = {
	completed: 1,
	partial: 0.5,
	notDone: 0,
	excluded: 0,
};

const FINISHED_TYPES = new Set(["done", "closed"]);

// null means the task isn't finished.
export function outcomeOf(status: string, statusType: string): Outcome | null {
	const known = STATUS_OUTCOMES[status.toLowerCase()];
	if (known) return known;
	return FINISHED_TYPES.has(statusType) ? "completed" : null;
}

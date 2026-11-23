import {
	CalendarClock,
	FolderKanban,
	LayoutDashboard,
	ListChecks,
	type LucideIcon,
	TrendingUp,
} from "lucide-react";

export type NavItem = {
	to: "/" | "/throughput" | "/deadlines" | "/projects" | "/tasks";
	label: string;
	icon: LucideIcon;
};

export const navItems: NavItem[] = [
	{ to: "/", label: "Overview", icon: LayoutDashboard },
	{ to: "/throughput", label: "Throughput", icon: TrendingUp },
	{ to: "/deadlines", label: "Deadlines", icon: CalendarClock },
	{ to: "/projects", label: "Projects", icon: FolderKanban },
	{ to: "/tasks", label: "Tasks", icon: ListChecks },
];

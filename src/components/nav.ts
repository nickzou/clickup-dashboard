import {
	CalendarClock,
	FolderKanban,
	LayoutDashboard,
	ListChecks,
	type LucideIcon,
	Settings,
	TrendingUp,
} from "lucide-react";

export type NavItem = {
	to: "/" | "/throughput" | "/deadlines" | "/projects" | "/tasks" | "/settings";
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

// Sits in the sidebar footer, above Sign out.
export const settingsItem: NavItem = {
	to: "/settings",
	label: "Settings",
	icon: Settings,
};

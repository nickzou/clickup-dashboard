import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { AppSidebar } from "#/components/app-sidebar";
import { BigScreenToggle } from "#/components/big-screen-toggle";
import { navItems, settingsItem } from "#/components/nav";
import { SyncButton } from "#/components/sync-status";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import { getAuthState } from "#/server/auth";

// Pathless layout: every route under _authed/ requires a session.
export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		if (!(await getAuthState()).authenticated) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const { pathname } = useLocation();
	const title =
		[...navItems, settingsItem].find((i) => i.to === pathname)?.label ??
		"Overview";

	return (
		// Starts collapsed to the icon rail; the trigger expands it.
		<SidebarProvider defaultOpen={false}>
			<AppSidebar />
			<SidebarInset>
				{/* In big screen view the bar goes: only its buttons remain, floating
				    top right, level with the page's first row (the filters). */}
				<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur big-screen:absolute big-screen:right-0 big-screen:h-auto big-screen:border-0 big-screen:bg-transparent big-screen:p-4 big-screen:backdrop-blur-none md:big-screen:p-6">
					<SidebarTrigger className="-ml-1 big-screen:hidden" />
					<Separator
						orientation="vertical"
						className="mr-2 h-4 big-screen:hidden"
					/>
					<h1 className="text-base font-semibold big-screen:hidden">{title}</h1>
					<div className="ml-auto flex items-center gap-1">
						<SyncButton className="hidden big-screen:inline-flex" />
						<BigScreenToggle />
					</div>
				</header>
				<main className="flex-1 p-4 md:p-6">
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}

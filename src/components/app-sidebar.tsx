import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Waves } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "#/components/ui/sidebar";
import { logout } from "#/server/auth";
import { navItems, settingsItem } from "./nav";
import { SyncStatus } from "./sync-status";

export function AppSidebar() {
	const { pathname } = useLocation();
	const { setOpenMobile } = useSidebar();
	const router = useRouter();
	const logoutFn = useServerFn(logout);

	async function onLogout() {
		await logoutFn();
		await router.invalidate();
		await router.navigate({ to: "/login" });
	}

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/" onClick={() => setOpenMobile(false)}>
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
									<Waves className="size-4" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">Overview</span>
									<span className="truncate text-xs text-muted-foreground">
										ClickUp stats
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems.map((item) => (
								<SidebarMenuItem key={item.to}>
									<SidebarMenuButton
										asChild
										tooltip={item.label}
										isActive={pathname === item.to}
									>
										<Link to={item.to} onClick={() => setOpenMobile(false)}>
											<item.icon />
											<span>{item.label}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SyncStatus />
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							tooltip={settingsItem.label}
							isActive={pathname === settingsItem.to}
						>
							<Link to={settingsItem.to} onClick={() => setOpenMobile(false)}>
								<settingsItem.icon />
								<span>{settingsItem.label}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip="Sign out" onClick={onLogout}>
							<LogOut />
							<span>Sign out</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

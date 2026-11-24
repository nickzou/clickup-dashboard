import { createFileRoute } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import { type Theme, useTheme } from "#/lib/theme";

export const Route = createFileRoute("/_authed/settings")({
	component: SettingsPage,
});

const THEMES = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
] as const;

function SettingsPage() {
	const { theme, setTheme } = useTheme();

	return (
		<div className="grid max-w-2xl grid-cols-1 gap-4 md:gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Appearance</CardTitle>
					<CardDescription>
						Saved on this device. System follows the device's setting.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ToggleGroup
						type="single"
						variant="outline"
						value={theme}
						// Ignore the deselect a second click on the active item sends.
						onValueChange={(v) => v && setTheme(v as Theme)}
						aria-label="Theme"
					>
						{THEMES.map((t) => (
							<ToggleGroupItem key={t.value} value={t.value} className="px-4">
								<t.icon />
								{t.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</CardContent>
			</Card>
		</div>
	);
}

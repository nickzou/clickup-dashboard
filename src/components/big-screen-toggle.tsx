import { Minimize2, Tv } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { useBigScreen, useWakeLock } from "#/lib/big-screen";

export function BigScreenToggle() {
	const { on, setOn } = useBigScreen();
	useWakeLock(on);
	const label = on ? "Exit big screen view" : "Big screen view";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={label}
					aria-pressed={on}
					onClick={() => setOn(!on)}
				>
					{on ? <Minimize2 /> : <Tv />}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

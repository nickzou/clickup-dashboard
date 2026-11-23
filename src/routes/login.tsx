import {
	createFileRoute,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { getAuthState, login } from "#/server/auth";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	beforeLoad: async () => {
		if ((await getAuthState()).authenticated) throw redirect({ to: "/" });
	},
	head: () => ({ meta: [{ title: "Sign in · Overview" }] }),
	component: LoginPage,
});

function LoginPage() {
	const { redirect: redirectTo } = Route.useSearch();
	const router = useRouter();
	const navigate = useNavigate();
	const loginFn = useServerFn(login);
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setPending(true);
		setError(undefined);
		try {
			const password = String(new FormData(e.currentTarget).get("password"));
			const result = await loginFn({ data: { password } });
			if (!result.ok) {
				setError(result.error);
				return;
			}
			await router.invalidate();
			// Only follow same-site paths, never an absolute URL.
			const target =
				redirectTo?.startsWith("/") && !redirectTo.startsWith("//")
					? redirectTo
					: "/";
			await navigate({ href: target, replace: true });
		} catch {
			setError("Something went wrong. Try again.");
		} finally {
			setPending(false);
		}
	}

	return (
		<main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
			<Card className="w-full max-w-sm">
				<CardHeader className="text-center">
					<div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
						<LockKeyhole className="size-5" />
					</div>
					<CardTitle className="text-xl">Overview</CardTitle>
					<CardDescription>Enter your password to continue.</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="grid gap-4">
						{/* Hidden username lets password managers save the entry. */}
						<input
							type="text"
							name="username"
							autoComplete="username"
							value="me"
							readOnly
							hidden
						/>
						<div className="grid gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								required
								autoFocus
								aria-invalid={error ? true : undefined}
								aria-describedby={error ? "login-error" : undefined}
							/>
							{error && (
								<p id="login-error" className="text-sm text-destructive">
									{error}
								</p>
							)}
						</div>
						<Button type="submit" disabled={pending}>
							{pending && <LoaderCircle className="animate-spin" />}
							Sign in
						</Button>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}

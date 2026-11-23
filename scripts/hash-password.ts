// Prints a DASHBOARD_PASSWORD_HASH line for .env.
// Usage: pnpm hash-password
import { createInterface } from "node:readline";
import { hash } from "@node-rs/argon2";

const rl = createInterface({ input: process.stdin, output: process.stdout });
// Hide the typed password.
(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
	() => {};
process.stdout.write("Password: ");

rl.question("", async (password) => {
	rl.close();
	process.stdout.write("\n");
	if (password.length < 12) {
		console.error("Use at least 12 characters.");
		process.exit(1);
	}
	// Single quotes keep both docker compose and node --env-file from
	// interpolating the $ signs in the hash.
	console.log(`DASHBOARD_PASSWORD_HASH='${await hash(password)}'`);
});

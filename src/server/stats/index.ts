import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "../auth";
import { getDb } from "../db/client";
import { env } from "../env";
import { getOverviewStats } from "./overview";
import { RANGES } from "./ranges";

export const overviewInput = z.object({
	range: z.enum(Object.keys(RANGES) as [keyof typeof RANGES]).default("30d"),
	space: z.string().optional(),
});
export type OverviewInput = z.infer<typeof overviewInput>;

export const getOverview = createServerFn({ method: "GET" })
	.middleware([requireAuth])
	.validator(overviewInput)
	.handler(({ data }) =>
		getOverviewStats(getDb(), {
			range: data.range,
			spaceId: data.space,
			timeZone: env().TZ,
		}),
	);

export const overviewQuery = (input: OverviewInput) =>
	queryOptions({
		queryKey: ["overview", input],
		queryFn: () => getOverview({ data: input }),
	});

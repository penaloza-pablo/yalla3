import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { backfillUpcoming } from "./shared/reconcile-booking-cleanings.mjs";

const dryRun = process.argv.includes("--dry-run");
const fromArg = process.argv.find((arg) => arg.startsWith("--from="))?.slice(7);
const toArg = process.argv.find((arg) => arg.startsWith("--to="))?.slice(5);

const ctx = {
  ddb: new DynamoDBClient({ region: process.env.AWS_REGION || "eu-central-1" }),
  visitsTable: process.env.VISITS_TABLE || "yalla-visits",
  bookingsTable: process.env.TABLE_NAME || process.env.BOOKINGS_TABLE || "yalla-bookings",
  cleaningTeamId: process.env.CLEANING_TEAM_ID || "team_cleaning",
  cleaningVisitTypeId: process.env.CLEANING_VISIT_TYPE_ID || "visit_type_cleaning",
  dryRun,
};

const result = await backfillUpcoming(ctx, { fromDate: fromArg, toDate: toArg });
const actions = result.results.flatMap((entry) => entry.actions || []);
console.log(
  JSON.stringify(
    {
      dryRun,
      from: result.from,
      to: result.to,
      visitCount: result.visitCount,
      reservationCount: result.reservationCount,
      actionCount: actions.length,
      actions,
    },
    null,
    2
  )
);

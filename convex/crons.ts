import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily at 03:10 UTC — low-traffic window. Each sweep paginates via the
// scheduler so a large backlog doesn't blow the transaction budget.
crons.cron(
  "cleanup stale data",
  "10 3 * * *",
  internal.cleanup.runAll,
  {},
);

export default crons;

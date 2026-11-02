import { existsSync, readFileSync } from "node:fs";

// Deployment-specific identifiers stay outside version control.
const path = existsSync("deployment.config.json") ? "deployment.config.json" : "deployment.config.example.json";
export const deployment = JSON.parse(readFileSync(path, "utf8")) as {
 accountId: string; databaseId: string; kvId: string; siteOrigin: string;
 domains: string[]; accessTeamDomain: string; accessAud: string; ownerEmail: string;
};

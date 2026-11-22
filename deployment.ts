import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Deployment-specific identifiers stay outside version control.
const local = join(import.meta.dirname, "deployment.config.json");
const path = existsSync(local) ? local : join(import.meta.dirname, "deployment.config.example.json");
export const deployment = JSON.parse(readFileSync(path, "utf8")) as {
	accountId: string;
	databaseId: string;
	usersDatabaseId: string;
	kvId: string;
	siteOrigin: string;
	domains: string[];
	accessTeamDomain: string;
	accessAud: string;
};

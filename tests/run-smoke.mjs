import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testAgentDir = await mkdtemp(join(tmpdir(), "quiet-activity-test-"));
const configDir = join(testAgentDir, "extension-data", "quiet-activity");

try {
	await mkdir(configDir, { recursive: true });
	await writeFile(
		join(configDir, "config.json"),
		`${JSON.stringify({ enabled: true }, null, 2)}\n`,
		"utf8",
	);
	process.env.PI_CODING_AGENT_DIR = testAgentDir;

	const { default: smokeTest } = await import("./smoke.ts");
	smokeTest();
} finally {
	await rm(testAgentDir, { recursive: true, force: true });
}

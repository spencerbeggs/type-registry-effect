import { AgentPlugin } from "@vitest-agent/plugin";
import { defineConfig } from "vitest/config";

export default async () => {
	const { projects, tags } = await AgentPlugin.discover();
	return defineConfig({
		plugins: [
			AgentPlugin({
				console: {
					human: "stream",
					agent: "agent",
				},
				coverageTargets: AgentPlugin.COVERAGE_LEVELS.strict.coverageTargets,
			}),
		],
		resolve: {
			alias: {
				// The repo builds and typechecks against the catalog typescript
				// (7.x/tsgo, no compiler API); tests exercising TsEnvironment need
				// a classic compiler at runtime, provided via this npm alias.
				typescript: "typescript-classic",
			},
		},
		test: {
			...(projects ? { projects } : {}),
			tags,
			pool: "forks",
			globalSetup: ["vitest.setup.ts"],
			coverage: {
				enabled: true,
				provider: "v8",
				thresholds: AgentPlugin.COVERAGE_LEVELS.standard.thresholds,
				exclude: [],
			},
		},
	});
};

import { VitestConfig } from "@savvy-web/vitest";

export default VitestConfig.create(
	({ projects, coverage, reporters }) => ({
		test: {
			reporters,
			projects: projects.map((p) => p.toConfig()),
			coverage: { provider: "v8", ...coverage },
		},
	}),
	{
		thresholds: {
			lines: 80,
			statements: 80,
			functions: 70,
			branches: 60,
		},
	},
);

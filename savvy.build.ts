import { build } from "@savvy-web/bundler";

await build({
	meta: {
		tsdoc: {
			// Effect's Context.Tag generates synthetic `_base` intermediate classes
			// that cannot be exported or release-tagged from source. This is the
			// toolchain-sanctioned suppression for this pattern.
			//
			// `export * as X` namespace re-exports synthesize `X_d_exports` wrapper
			// namespaces in the bundled declarations that cannot carry a TSDoc
			// release tag from source. `export * as` is the only namespace re-export
			// form the DTS bundler emits correctly (see src/index.ts), so the
			// missing-release-tag diagnostic on the wrappers is suppressed.
			suppressWarnings: [
				{ messageId: "ae-forgotten-export", pattern: "_base" },
				{ messageId: "ae-missing-release-tag", pattern: "_d_exports" },
			],
		},
	},
});

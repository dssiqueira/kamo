// Flags fixed when the app is built (electron.vite.config.ts → main.define), never read from
// the environment at run time: a packaged app must not change behaviour because some other
// process started it with a variable set.
//
// - KAMO_BUILD_CI_SMOKE=1 (CI's packaging jobs only, never a release): the packaged app keeps
//   the `--smoke-test` and KAMO_SMOKE_* hooks the CI smoke test and export benchmark drive.
// - KAMO_BUILD_MCP_ON_NPM=1 (the release, only when it also publishes @kamo/mcp): Settings →
//   Connect to an agent offers `npx -y @kamo/mcp@<app version>`.
declare const __KAMO_CI_SMOKE__: boolean | undefined
declare const __KAMO_MCP_ON_NPM__: boolean | undefined

/** Built for CI's packaged smoke test (see above). */
export const CI_SMOKE_BUILD = typeof __KAMO_CI_SMOKE__ === 'boolean' && __KAMO_CI_SMOKE__

/** Built by a release that publishes @kamo/mcp at the app's version (see above). */
export const MCP_ON_NPM_BUILD = typeof __KAMO_MCP_ON_NPM__ === 'boolean' && __KAMO_MCP_ON_NPM__

/**
 * Test and debug hooks (`--smoke-test`, KAMO_SMOKE_*, KAMO_AUDIO_SELF_TEST,
 * KAMO_PACKS_MANIFEST_URL): development runs, and the packaged app only when built for CI.
 */
export function debugHooksAllowed(packaged: boolean, ciSmokeBuild = CI_SMOKE_BUILD): boolean {
  return !packaged || ciSmokeBuild
}

/**
 * The `@kamo/mcp` version Settings may tell users to `npx`, or null while it is not on npm:
 * development builds, 0.0.0, and releases built without publishing it.
 */
export function publishedMcpVersion(
  packaged: boolean,
  appVersion: string,
  onNpm = MCP_ON_NPM_BUILD,
): string | null {
  if (!packaged || !onNpm) return null
  return /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(appVersion) && appVersion !== '0.0.0'
    ? appVersion
    : null
}

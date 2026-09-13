/**
 * The rtk probe, shared by both members of the executor family. Its result is
 * the availability gate of `wrapWithRtk`: a deployment without the binary
 * behaves exactly like the stock executor it replaces.
 *
 * Internal module — not a public subpath.
 *
 * @module @deeptrial/dsh-bash-rtk/rtk
 */

import { spawnSync } from 'node:child_process'

/**
 * Probe for the `rtk` binary on PATH; absence degrades to the identity
 * transform. An explicit `rtkAvailable` config value overrides this.
 * @returns true when `rtk --version` exits 0.
 */
export function probeRtk(): boolean {
  try {
    const result = spawnSync('rtk', ['--version'], { stdio: 'ignore' })
    return result.status === 0
  } catch {
    /* v8 ignore next -- spawnSync throws only on a broken runtime, not a missing binary */
    return false
  }
}

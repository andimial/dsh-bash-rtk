/**
 * The availability gate of `wrapWithRtk`, shared by both members of the
 * executor family: the process. A deployment without the binary behaves
 * exactly like the stock executor it replaces. Availability is deliberately
 * not a per-run decision — confined Windows runs are routed like any other,
 * and the restricted-token failure that follows is documented rather than
 * guarded (see docs/adr/0004).
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

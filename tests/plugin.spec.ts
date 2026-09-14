import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  name: string
  version: string
  engines: Record<string, string>
  exports: Record<string, { types: string; default: string } | string>
  peerDependencies: Record<string, string>
}

const plugin = JSON.parse(readFileSync(new URL('../dsh.plugin.json', import.meta.url), 'utf8')) as {
  id: string
  version: string
  engines: Record<string, string>
}

/** The release this work ships. */
const RELEASE = '0.2.1'

/** The engines range the release deliberately leaves untouched. */
const ENGINES = { dsh: '>=0.1.0-rc.6 <0.2.0 || >=0.1.1-rc.1 <0.2.0-0' }

/** The per-package range the 0.1.x track published for every harness sub-package. */
const PEER_RANGE = '>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.1.1 || >=0.1.1-rc.1 <0.2.0-0'

describe('plugin manifests', () => {
  it('carries the release version in both manifests', () => {
    expect(manifest.version).toBe(RELEASE)
    expect(plugin.version).toBe(RELEASE)
  })

  it('keeps the id and the engines ranges unchanged', () => {
    expect(plugin.id).toBe(manifest.name)
    expect(plugin.engines).toEqual(ENGINES)
    expect(manifest.engines).toEqual({ node: '>=20.0.0' })
  })

  it('leaves the peer ranges on the 0.1.x prerelease track', () => {
    const peers = Object.entries(manifest.peerDependencies)
    expect(peers).toHaveLength(5)
    for (const [name, range] of peers) {
      expect(range, name).toBe(PEER_RANGE)
    }
  })

  it('points every subpath export at a file that ships', () => {
    for (const [subpath, target] of Object.entries(manifest.exports)) {
      const files = typeof target === 'string' ? [target] : [target.types, target.default]
      for (const file of files) {
        expect(existsSync(new URL(`../${file}`, import.meta.url)), `${subpath} -> ${file}`).toBe(true)
      }
    }
  })
})

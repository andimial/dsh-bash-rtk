import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** The shipped overlay's rows: comments document the recipe, the rows are the artifact. */
const rows = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0 && !line.startsWith('#'))

describe('cordis.patch.yml overlay', () => {
  it('holds a single insert, the shell-rtk auto assembler', () => {
    expect(rows.filter(row => row === '- insert:')).toHaveLength(1)
    expect(rows.filter(row => row.startsWith('- id:'))).toEqual(['- id: shell-rtk'])
    expect(rows).toContain("name: '@deeptrial/dsh-bash-rtk/auto'")
  })

  it('stays disabled by default', () => {
    expect(rows).toContain('disabled: true')
    expect(rows.some(row => row === 'disabled: false')).toBe(false)
  })
})

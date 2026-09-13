import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pickShell } from '../src/auto.ts'

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const en = read('README.md')
const zh = read('README.zh.md')

/** Heading lines (a `#` run followed by a space), outside fenced code blocks — install snippet comments live inside one. */
function headings(markdown: string): string[] {
  let inFence = false
  return markdown.split('\n').filter(line => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      return false
    }
    return !inFence && /^#{1,6}\s/.test(line)
  })
}

/** Heading text, without the leading hashes. */
function titles(markdown: string): string[] {
  return headings(markdown).map(heading => heading.replace(/^#+\s*/, '').trim())
}

/** Every `[label](#anchor)` link in the document. */
function tocLabels(markdown: string): string[] {
  return [...markdown.matchAll(/\[([^\]]+)\]\(#([^)]+)\)/g)].map(match => match[1] as string)
}

/** A `| a | b |` line as ['a', 'b']. */
function cellsOf(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim())
}

/**
 * The one table whose header row matches `header`, found by scanning table blocks
 * (a header row immediately followed by a separator row).
 */
function tableWithHeader(markdown: string, header: string[]): string[][] {
  const lines = markdown.split('\n')
  const found: string[][][] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const next = lines[i + 1]
    if (!line.startsWith('|') || next === undefined || !next.startsWith('|')) continue
    const cells = cellsOf(line)
    const separator = next
      .split('|')
      .slice(1, -1)
      .every(cell => /^:?-+:?$/.test(cell.trim()))
    if (!separator || cells.length !== header.length || cells[0] !== header[0]) continue
    const body: string[][] = []
    for (let j = i + 2; j < lines.length; j++) {
      const row = lines[j] as string
      if (!row.startsWith('|')) break
      body.push(cellsOf(row))
    }
    found.push([cells, ...body])
  }
  expect(found, `no table with header ${header.join(' | ')}`).toHaveLength(1)
  return found[0] as string[][]
}

describe('bilingual READMEs', () => {
  it('documents the same number of headings, at the same levels', () => {
    expect(headings(en).length).toBeGreaterThan(10)
    expect(headings(zh)).toHaveLength(headings(en).length)
    expect(headings(zh).map(line => line.match(/^#+/)?.[0])).toEqual(headings(en).map(line => line.match(/^#+/)?.[0]))
  })

  it('documents the same configuration options in both languages', () => {
    const options = (markdown: string): string[] =>
      markdown
        .split('\n')
        .filter(line => line.startsWith('|'))
        .map(cellsOf)
        .map(cells => cells[0] as string)
    for (const option of ['`rtkAvailable`', '`preferShell`', '`pwshAvailable`', '`pwshPath`']) {
      expect(options(en), option).toContain(option)
      expect(options(zh), option).toContain(option)
    }
  })

  it('sends every table-of-contents link to a heading of the same document', () => {
    for (const markdown of [en, zh]) {
      const own = titles(markdown)
      const labels = tocLabels(markdown)
      expect(labels.length).toBeGreaterThan(5)
      for (const label of labels) expect(own, label).toContain(label)
    }
  })
})

describe('pwsh documentation', () => {
  it('gives the pwsh dialect a chapter in both languages', () => {
    expect(titles(en)).toContain('pwsh support')
    expect(titles(zh)).toContain('pwsh 支持')
  })

  it('names both metacharacter sets, bash first and the pwsh additions second', () => {
    for (const markdown of [en, zh]) {
      expect(markdown).toContain('`\\|` `&` `;` `<` `>` `` ` `` `$`')
      expect(markdown).toContain('`()` `@` `{}` `#`')
    }
  })

  it('shows how the dialect changes routing for one command in both quick-example tables', () => {
    expect(en).toMatch(/bash: `rtk git status # note`/)
    expect(zh).toMatch(/bash: `rtk git status # note`/)
  })
})

describe('assembly matrix', () => {
  const headers = {
    en: ['platform', 'pwsh', 'preferShell', 'mounted executor'],
    zh: ['平台', 'pwsh', 'preferShell', '挂载的执行器'],
  }
  /** Probe verdict -> each language's word for it, and the boolean `pickShell()` takes. */
  const probeWords = {
    en: { present: 'present', absent: 'absent' },
    zh: { present: '存在', absent: '缺失' },
  } as const
  /** The matrix table of one README, header row included. */
  const matrix = (markdown: string, lang: 'en' | 'zh') => tableWithHeader(markdown, headers[lang])

  it('documents the executor pickShell actually picks, for every combination', () => {
    for (const [lang, markdown] of [
      ['en', en],
      ['zh', zh],
    ] as const) {
      const [head, ...body] = matrix(markdown, lang) as [string[], ...string[][]]
      expect(head).toEqual(headers[lang])
      const words = probeWords[lang]
      // windows + linux/macos, present + absent, auto/pwsh/bash: each combination decided once
      expect(body).toHaveLength(10)
      for (const row of body) {
        expect(row, row.join(' | ')).toHaveLength(4)
        expect(row[0]).toMatch(/^(Windows|Linux \/ macOS)$/)
        expect([words.present, words.absent], row.join(' | ')).toContain(row[1] as string)
        expect(row[2]).toMatch(/^`(auto|pwsh|bash)`$/)
        const preference = (row[2] as string).replace(/`/g, '') as 'auto' | 'pwsh' | 'bash'
        // the family the docs promise is the one the implementation picks for that verdict
        expect(row[3], row.join(' | ')).toContain(pickShell(preference, row[1] === words.present))
      }
      expect(new Set(body.map(row => row.slice(0, 3).join('/'))).size).toBe(body.length)
      expect(body.map(row => row[2])).toEqual(expect.arrayContaining(['`auto`', '`pwsh`', '`bash`']))
      expect(body.map(row => row[0])).toEqual(expect.arrayContaining(['Windows', 'Linux / macOS']))
      expect(body.filter(row => row[1] === words.present)).toHaveLength(6)
    }
  })
  it('mounts pwsh for auto where the probe finds it, and bash otherwise', () => {
    const [headEn, ...enBody] = matrix(en, 'en') as [string[], ...string[][]]
    const [headZh, ...zhBody] = matrix(zh, 'zh') as [string[], ...string[][]]
    expect(headEn.length).toBe(headZh.length)
    const at = (body: string[][], platform: string, probe: string, preference: string) =>
      body.find(cells => cells[0] === platform && cells[1] === probe && cells[2] === `\`${preference}\``)
    expect(at(enBody, 'Windows', 'present', 'auto')?.[3]).toContain('pwsh')
    expect(at(enBody, 'Windows', 'absent', 'auto')?.[3]).toContain('bash')
    expect(at(enBody, 'Windows', 'present', 'bash')?.[3]).toContain('bash')
    expect(at(enBody, 'Windows', 'absent', 'pwsh')?.[3]).toContain('pwsh')
    expect(at(enBody, 'Linux / macOS', 'absent', 'auto')?.[3]).toContain('bash')
    expect(at(zhBody, 'Windows', '存在', 'auto')?.[3]).toContain('pwsh')
    expect(at(zhBody, 'Windows', '缺失', 'auto')?.[3]).toContain('bash')
    expect(at(zhBody, 'Linux / macOS', '存在', 'bash')?.[3]).toContain('bash')
  })
})

describe('0.1.x -> 0.2.0 migration', () => {
  it('tells a reader to retire the bash-rtk entry and enable shell-rtk', () => {
    /** The migration chapter: from its heading to the next same-level heading. */
    const chapter = (markdown: string) => {
      const section = markdown.split(/^## /m).find(s => s.startsWith('Upgrading') || s.startsWith('从 0.1.x'))
      expect(section, 'migration chapter').toBeDefined()
      return section as string
    }
    for (const markdown of [en, zh]) {
      const migration = chapter(markdown)
      expect(migration).toMatch(/^\s+- id: bash-rtk$/m)
      expect(migration).toMatch(/^\s+name: '@deeptrial\/dsh-bash-rtk\/auto'$/m)
      expect(migration).toMatch(/0\.1\.x/)
      expect(migration).toMatch(/^\s+- id: shell-rtk$/m)
      expect(migration).toMatch(/^\s+preferShell: auto$/m)
    }
  })
  it('is a chapter of its own in both languages', () => {
    expect(titles(en)).toContain('Upgrading from 0.1.x')
    expect(titles(zh)).toContain('从 0.1.x 升级')
  })
})

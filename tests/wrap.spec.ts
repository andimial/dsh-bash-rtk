import { describe, expect, it } from 'vitest'
import { wrapWithRtk } from '../src/wrap.ts'

describe('wrapWithRtk', () => {
  describe('rtk unavailable', () => {
    it('passes every command through unchanged', () => {
      expect(wrapWithRtk('git status', false)).toBe('git status')
      expect(wrapWithRtk('cargo build --release', false)).toBe('cargo build --release')
    })
  })

  describe('complex shell commands pass through unchanged', () => {
    it('pipes', () => {
      expect(wrapWithRtk('git status | grep modified', true)).toBe('git status | grep modified')
    })
    it('logical lists', () => {
      expect(wrapWithRtk('npm install && npm run build', true)).toBe('npm install && npm run build')
      expect(wrapWithRtk('cargo test || cargo check', true)).toBe('cargo test || cargo check')
    })
    it('semicolon lists', () => {
      expect(wrapWithRtk('cd src; git status', true)).toBe('cd src; git status')
    })
    it('redirections', () => {
      expect(wrapWithRtk('git log > /tmp/log.txt', true)).toBe('git log > /tmp/log.txt')
    })
    it('command substitution and variables', () => {
      expect(wrapWithRtk('echo $(git rev-parse HEAD)', true)).toBe('echo $(git rev-parse HEAD)')
      expect(wrapWithRtk('git commit -m "$MSG"', true)).toBe('git commit -m "$MSG"')
    })
  })

  describe('shell dimensions', () => {
    // pwsh-only metacharacters: expression parens, splatting/array `@`,
    // scriptblock braces, comments, and line breaks. Each row carries the
    // bash expectation too, which is the 0.1.x byte-for-byte result.
    const pwshOnly: readonly (readonly [string, string, string])[] = [
      ['parentheses', 'git log (dev)', 'rtk git log (dev)'],
      ['at-sign', 'git push @args', 'rtk git push @args'],
      ['braces', 'git log @{u}..HEAD', 'rtk git log @{u}..HEAD'],
      ['hash', 'git status # note', 'rtk git status # note'],
      ['newline', 'git status\ngit log', 'rtk git status\ngit log'],
      ['carriage return', 'git status\r\ngit log', 'rtk git status\r\ngit log'],
    ]

    it('defaults to the pwsh metacharacter set', () => {
      expect(wrapWithRtk('git status # note', true)).toBe(wrapWithRtk('git status # note', true, 'pwsh'))
      expect(wrapWithRtk('git status # note', true)).toBe('git status # note')
      expect(wrapWithRtk('git status', true)).toBe('rtk git status')
    })

    it.each(pwshOnly)('pwsh passes a command with %s through', (_label, command) => {
      expect(wrapWithRtk(command, true, 'pwsh')).toBe(command)
    })

    it.each(pwshOnly)('bash treats %s as plain argument text', (_label, command, wrapped) => {
      expect(wrapWithRtk(command, true, 'bash')).toBe(wrapped)
    })

    it.each([
      ['pipe', 'git status | grep modified'],
      ['logical list', 'npm install && npm run build'],
      ['redirection', 'git log > /tmp/log.txt'],
      ['variable', 'git commit -m "$MSG"'],
    ])('the shared metacharacter set disqualifies a %s in both dimensions', (_label, command) => {
      expect(wrapWithRtk(command, true, 'bash')).toBe(command)
      expect(wrapWithRtk(command, true, 'pwsh')).toBe(command)
    })

    it('dispatches on the shell argument alone', () => {
      expect(wrapWithRtk('git status # note', true, 'pwsh')).toBe('git status # note')
      expect(wrapWithRtk('git status # note', true, 'bash')).toBe('rtk git status # note')
    })

    it('keeps the whitelist and first-token extraction dimension-independent', () => {
      for (const shell of ['bash', 'pwsh'] as const) {
        expect(wrapWithRtk('ls -la', true, shell)).toBe('ls -la')
        expect(wrapWithRtk('git status', true, shell)).toBe('rtk git status')
      }
    })

    it('gates on rtk availability in every dimension', () => {
      expect(wrapWithRtk('git status', false, 'bash')).toBe('git status')
      expect(wrapWithRtk('git status', false, 'pwsh')).toBe('git status')
    })
  })

  describe('non-whitelisted commands pass through unchanged', () => {
    it('unknown executable', () => {
      expect(wrapWithRtk('ls -la', true)).toBe('ls -la')
      expect(wrapWithRtk('python script.py', true)).toBe('python script.py')
    })
    it('sudo-prefixed commands are not wrapped', () => {
      expect(wrapWithRtk('sudo git status', true)).toBe('sudo git status')
    })
    it('env-assigned commands are not wrapped', () => {
      expect(wrapWithRtk('FOO=bar git status', true)).toBe('FOO=bar git status')
    })
  })

  describe('whitelisted simple commands are wrapped', () => {
    it('git', () => {
      expect(wrapWithRtk('git status', true)).toBe('rtk git status')
    })
    it('cargo', () => {
      expect(wrapWithRtk('cargo build --release', true)).toBe('rtk cargo build --release')
    })
    it('npm', () => {
      expect(wrapWithRtk('npm install', true)).toBe('rtk npm install')
    })
    it('golangci-lint maps to its rtk subcommand', () => {
      expect(wrapWithRtk('golangci-lint run', true)).toBe('rtk golangci-lint run')
    })
    it('preserves arguments verbatim', () => {
      expect(wrapWithRtk('git log --oneline -10', true)).toBe('rtk git log --oneline -10')
    })
    it('matches the first token case-insensitively', () => {
      expect(wrapWithRtk('GIT status', true)).toBe('rtk git status')
    })
    it('wraps a bare command with no arguments', () => {
      expect(wrapWithRtk('git', true)).toBe('rtk git')
    })
  })

  describe('edge cases', () => {
    it('empty command passes through', () => {
      expect(wrapWithRtk('', true)).toBe('')
    })
    it('whitespace-only command passes through', () => {
      expect(wrapWithRtk('   ', true)).toBe('   ')
    })
    it('preserves leading whitespace', () => {
      expect(wrapWithRtk('  git status', true)).toBe('rtk git status')
    })
  })
})

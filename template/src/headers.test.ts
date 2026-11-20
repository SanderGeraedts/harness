import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, headersFile } from './headers'

describe('the content security policy', () => {
  it("allows this origin only when the build has no backend address", () => {
    expect(contentSecurityPolicy('')).toContain("connect-src 'self';")
    expect(contentSecurityPolicy('')).not.toMatch(/https?:/)
  })

  it("adds the backend's origin to connect-src, and nothing else", () => {
    const policy = contentSecurityPolicy('https://backend.example/some/path')
    expect(policy).toContain("connect-src 'self' https://backend.example;")
    expect(policy.replace(' https://backend.example', '')).toBe(contentSecurityPolicy(''))
  })
})

describe('the _headers file', () => {
  it('gives every path the policy and the other security headers', () => {
    const lines = headersFile('').split('\n')
    expect(lines[0]).toBe('/*')
    expect(lines[1]).toBe(`  Content-Security-Policy: ${contentSecurityPolicy('')}`)
    expect(lines).toContain('  X-Content-Type-Options: nosniff')
    expect(lines).toContain('  Referrer-Policy: no-referrer')
  })
})

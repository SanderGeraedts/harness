import { describe, expect, it } from 'vitest'
import { hasBase, renamedSlugs, slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('makes a readable slug from a title', () => {
    expect(slugify('Buy oat milk')).toBe('buy-oat-milk')
    expect(slugify('  Crème brûlée, twice!  ')).toBe('creme-brulee-twice')
    expect(slugify('A/B test: round #2')).toBe('a-b-test-round-2')
  })

  it('falls back when nothing is left or the slug is a route', () => {
    expect(slugify('!!!')).toBe('item')
    expect(slugify('')).toBe('item')
    expect(slugify('New')).toBe('item')
  })

  it('cuts a long title at a hyphen, at most 60 characters', () => {
    const slug = slugify('word '.repeat(30))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug).toMatch(/^word(-word)*$/)
    expect(slugify('x'.repeat(80))).toBe('x'.repeat(60))
  })

  it('never looks like an internal id', () => {
    expect(slugify(crypto.randomUUID())).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})

describe('uniqueSlug', () => {
  it('adds the first free number', () => {
    expect(uniqueSlug('tea', new Set())).toBe('tea')
    expect(uniqueSlug('tea', new Set(['tea']))).toBe('tea-2')
    expect(uniqueSlug('tea', new Set(['tea', 'tea-2']))).toBe('tea-3')
  })
})

describe('hasBase', () => {
  it('recognises a slug and its clash forms', () => {
    expect(hasBase('tea', 'tea')).toBe(true)
    expect(hasBase('tea-2', 'tea')).toBe(true)
    expect(hasBase('tea-pot', 'tea')).toBe(false)
    expect(hasBase('tea-02', 'tea')).toBe(false)
  })
})

describe('renamedSlugs', () => {
  it('keeps the slug when the title still makes it', () => {
    expect(renamedSlugs({ slug: 'tea-2', oldSlugs: [] }, 'Tea!', new Set(['tea']))).toEqual({ slug: 'tea-2', oldSlugs: [] })
  })

  it('gives a new slug and remembers the old one', () => {
    expect(renamedSlugs({ slug: 'tea', oldSlugs: [] }, 'Coffee', new Set())).toEqual({ slug: 'coffee', oldSlugs: ['tea'] })
  })

  it('avoids slugs other records hold', () => {
    expect(renamedSlugs({ slug: 'tea', oldSlugs: [] }, 'Coffee', new Set(['coffee']))).toEqual({ slug: 'coffee-2', oldSlugs: ['tea'] })
  })

  it('lets an earlier slug of its own come back', () => {
    expect(renamedSlugs({ slug: 'coffee', oldSlugs: ['tea'] }, 'Tea', new Set())).toEqual({ slug: 'tea', oldSlugs: ['coffee'] })
  })
})

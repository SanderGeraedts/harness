import { describe, expect, it } from 'vitest'
import { slugify } from '../db/slug'
import { backendSlugRule } from './testing'

// D-0005: the device (src/db/slug.ts) and the backend (backend/pb_hooks/slug.js) each make
// slugs, in two languages' worth of code. They must agree, or the backend would rename what
// a device just named.

const rule = backendSlugRule()

describe("the backend's slug rule", () => {
  it('makes the same slug from a title as the device', () => {
    const titles = ['Crème brûlée, twice!', 'new', '', '  --  ', 'ÀÉÎõü ß 123', 'a'.repeat(80), `${'word '.repeat(20)}end`, 'Tea', '日本語']
    for (const title of titles) expect(rule.slugify(title), title).toBe(slugify(title))
  })

  it('keeps a free slug, and gives a taken one the next number', () => {
    expect(rule.settle({ title: 'Tea', slug: 'tea', oldSlugs: [] }, null, [])).toEqual({ slug: 'tea', oldSlugs: [] })
    const others = [
      { slug: 'tea', oldSlugs: [] },
      { slug: 'coffee', oldSlugs: ['tea-2'] },
    ]
    expect(rule.settle({ title: 'Tea', slug: 'tea', oldSlugs: [] }, null, others)).toEqual({ slug: 'tea-3', oldSlugs: [] })
  })

  it("keeps a renamed item's earlier slug", () => {
    const stored = { slug: 'tea', oldSlugs: [] }
    expect(rule.settle({ title: 'Coffee', slug: 'coffee', oldSlugs: [] }, stored, [])).toEqual({ slug: 'coffee', oldSlugs: ['tea'] })
  })
})

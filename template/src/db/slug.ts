// D-0005 (G-0021): an item's address is a slug made from its title, never its id.

/** The longest slug made from a title; a `-2` suffix may come on top. */
export const SLUG_MAX = 60

/** What an empty or reserved slug becomes. */
export const FALLBACK_SLUG = 'item'

/** Slugs that clash with a route under /items/ (router.tsx). */
export const RESERVED_SLUGS: readonly string[] = ['new']

/**
 * A title's slug: accents stripped, lower case, every run of anything but ASCII letters and
 * digits one hyphen, no hyphen at either end, at most 60 characters cut at a hyphen. Empty
 * or reserved becomes "item". "Crème brûlée, twice!" → "creme-brulee-twice".
 */
export function slugify(title: string): string {
  let slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length > SLUG_MAX) {
    const cut = slug.slice(0, SLUG_MAX + 1)
    const hyphen = cut.lastIndexOf('-')
    slug = (hyphen > 0 ? cut.slice(0, hyphen) : slug.slice(0, SLUG_MAX)).replace(/-+$/, '')
  }
  if (slug === '' || RESERVED_SLUGS.includes(slug)) return FALLBACK_SLUG
  return slug
}

/** `slug` if it isn't taken, else the first free of `slug-2`, `slug-3`, … */
export function uniqueSlug(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) {
    const candidate = `${slug}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Whether `slug` is `base` itself or `base` with a clash suffix (`base-2`, `base-3`, …). */
export function hasBase(slug: string, base: string): boolean {
  if (slug === base) return true
  return slug.startsWith(`${base}-`) && /^[1-9][0-9]*$/.test(slug.slice(base.length + 1))
}

/** Every slug a record holds: its own and its earlier ones. */
export function slugsOf(record: { slug: string; oldSlugs: string[] }): string[] {
  return [...(record.slug ? [record.slug] : []), ...record.oldSlugs]
}

/**
 * The slug and earlier slugs a record gets for a new `title`:
 * - unchanged when the title still makes the same slug (`tea` or a clash form like `tea-2`);
 * - otherwise a new one, unique among `taken` (every other record's slugs, current and
 *   earlier), with the current slug kept in `oldSlugs` so its address still leads here. One
 *   of the record's own earlier slugs may come back.
 */
export function renamedSlugs(
  record: { slug: string; oldSlugs: string[] },
  title: string,
  taken: ReadonlySet<string>,
): { slug: string; oldSlugs: string[] } {
  const base = slugify(title)
  if (record.slug && hasBase(record.slug, base) && !taken.has(record.slug)) {
    return { slug: record.slug, oldSlugs: record.oldSlugs }
  }
  const slug = uniqueSlug(base, taken)
  const oldSlugs = [...new Set([...record.oldSlugs, ...(record.slug ? [record.slug] : [])])].filter((s) => s !== slug)
  return { slug, oldSlugs }
}

import { expect, test, type Locator, type Page } from '@playwright/test'
import { NOTE_MAX, TITLE_MAX } from '../src/db/db'
import { buildDemoItems } from '../src/seed/demo'
import { t } from '../src/text'

// The app on its seeded demo data (G-0019), as a user sees it. Text comes from src/text.ts,
// so these keep passing when the interface is translated (D-0004).

/** A UUID anywhere in a string. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** The address bar and every link on the page: none may hold a UUID (G-0021). */
async function expectNoUuid(page: Page) {
  expect(page.url()).not.toMatch(UUID)
  // Wait for a link before reading them all: reading doesn't wait by itself.
  await expect(page.locator('a[href]').first()).toBeVisible()
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href))
  expect(hrefs.length).toBeGreaterThan(0)
  for (const href of hrefs) expect(href).not.toMatch(UUID)
}

/** Loads the app, waits for the service worker to take the page over, then cuts the network. */
async function goOffline(page: Page) {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.context().setOffline(true)
  await page.reload()
}

test('the list shows the seeded items, and says it is demo data', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText(t.demoBanner)
  for (const item of buildDemoItems()) {
    await expect(page.getByRole('heading', { level: 2, name: item.title })).toBeVisible()
  }
  await expectNoUuid(page)
})

test('an item has its own readable address', async ({ page }) => {
  const [first] = buildDemoItems()
  await page.goto('/')
  await page.getByRole('link', { name: first!.title }).click()
  await expect(page).toHaveURL(`/items/${first!.slug}`)
  await expect(page.getByRole('heading', { level: 1, name: first!.title })).toBeVisible()
  await expectNoUuid(page)
})

test('create, edit and delete work offline, survive a reload, and never show a UUID', async ({ page }) => {
  await goOffline(page)
  await expect(page.getByRole('heading', { level: 1, name: t.items })).toBeVisible()

  // Create.
  await page.getByRole('link', { name: t.newItem }).click()
  await expect(page).toHaveURL('/items/new')
  await page.getByLabel(t.title).fill('Crème brûlée, twice!')
  await page.getByLabel(t.note).fill('With a torch.')
  await page.getByRole('button', { name: t.save }).click()
  await expect(page).toHaveURL('/items/creme-brulee-twice')
  await expect(page.getByRole('heading', { level: 1, name: 'Crème brûlée, twice!' })).toBeVisible()
  await expectNoUuid(page)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Crème brûlée, twice!' })).toBeVisible()
  await expect(page.getByText('With a torch.')).toBeVisible()

  // Edit: a new title gives a new address, and the old one still leads here.
  await page.getByRole('link', { name: t.edit }).click()
  await expect(page).toHaveURL('/items/creme-brulee-twice/edit')
  await page.getByLabel(t.title).fill('Lemon tart')
  await page.getByLabel(t.status).selectOption('done')
  await page.getByRole('button', { name: t.save }).click()
  await expect(page).toHaveURL('/items/lemon-tart')
  await expect(page.getByText(t.statuses.done, { exact: true })).toBeVisible()
  await expectNoUuid(page)

  await page.goto('/items/creme-brulee-twice')
  await expect(page).toHaveURL('/items/lemon-tart')
  await expect(page.getByRole('heading', { level: 1, name: 'Lemon tart' })).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: 'Lemon tart' })).toBeVisible()
  await expectNoUuid(page)

  // Delete, after a second step.
  await page.getByRole('link', { name: 'Lemon tart' }).click()
  await page.getByRole('button', { name: t.delete, exact: true }).click()
  await page.getByRole('button', { name: t.deleteConfirm }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { level: 2, name: buildDemoItems()[0]!.title })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Lemon tart' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { level: 2, name: buildDemoItems()[0]!.title })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Lemon tart' })).toHaveCount(0)
  await page.goto('/items/lemon-tart')
  await expect(page.getByRole('heading', { level: 1, name: t.notFound })).toBeVisible()
})

test('the form asks for a title', async ({ page }) => {
  await page.goto('/items/new')
  await page.getByRole('button', { name: t.save }).click()
  await expect(page.getByRole('alert')).toHaveText(t.titleMissing)
  await expect(page).toHaveURL('/items/new')
})

// The same limits the backend of a project that syncs has: a longer value could never sync.

/** Puts a value in a field past its `maxlength`, as a script or an autofill could. */
async function force(field: Locator, value: string) {
  await field.evaluate((el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

test('a title stops at its limit, and a longer one is refused in words', async ({ page }) => {
  await page.goto('/items/new')
  const title = page.getByLabel(t.title)
  await expect(title).toHaveAttribute('maxlength', String(TITLE_MAX))
  // Typing and pasting stop at the limit.
  await title.fill('t'.repeat(TITLE_MAX + 1))
  await expect(title).toHaveValue('t'.repeat(TITLE_MAX))

  await force(title, 't'.repeat(TITLE_MAX + 1))
  await page.getByRole('button', { name: t.save }).click()
  await expect(page.getByRole('alert')).toHaveText(t.titleTooLong(TITLE_MAX))
  await expect(page).toHaveURL('/items/new')

  // Exactly as long as the limit, it saves.
  await title.fill('t'.repeat(TITLE_MAX))
  await page.getByRole('button', { name: t.save }).click()
  await expect(page).toHaveURL(/\/items\/t+$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('a note stops at its limit, and a longer one is refused in words', async ({ page }) => {
  await page.goto('/items/new')
  const note = page.getByLabel(t.note)
  await expect(note).toHaveAttribute('maxlength', String(NOTE_MAX))
  await page.getByLabel(t.title).fill('A long note')
  await note.fill('n'.repeat(NOTE_MAX + 1))
  await expect(note).toHaveValue('n'.repeat(NOTE_MAX))

  await force(note, 'n'.repeat(NOTE_MAX + 1))
  await page.getByRole('button', { name: t.save }).click()
  await expect(page.getByRole('alert')).toHaveText(t.noteTooLong(NOTE_MAX))
  await expect(page).toHaveURL('/items/new')

  await note.fill('n'.repeat(NOTE_MAX))
  await page.getByRole('button', { name: t.save }).click()
  await expect(page).toHaveURL('/items/a-long-note')
  await expect(page.getByRole('heading', { level: 1, name: 'A long note' })).toBeVisible()
})

test('an address that leads nowhere says so', async ({ page }) => {
  await page.goto('/items/no-such-item')
  await expect(page.getByRole('heading', { level: 1, name: t.notFound })).toBeVisible()
})

test('is installable: a manifest with icons, and an active service worker', async ({ page }) => {
  await page.goto('/')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  const manifest = await (await page.request.get(manifestHref!)).json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)).toBe(true)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`/design shows the tokens and components in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/design')
    await expect(page.getByRole('heading', { level: 1, name: t.design })).toBeVisible()
    for (const label of Object.values(t.statuses)) await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    // The page follows the device's colour scheme (D-0003).
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const [r] = background.match(/\d+/g)!.map(Number)
    expect(r! > 128).toBe(colorScheme === 'light')
  })
}

// Phone first: no screen may be wider than the phone, whatever a user typed. A long note and
// a long word that can't break are what stretch a page.
for (const width of [320, 412]) {
  test(`no screen is wider than a ${width}px phone, with a long note and a long unbroken title`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    const fits = async (what: string) => {
      const { page: pageWidth, screen } = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        screen: document.documentElement.clientWidth,
      }))
      // Soft, so one run names every screen that is too wide.
      expect.soft(pageWidth, `${what} is ${pageWidth}px wide on a ${screen}px screen`).toBeLessThanOrEqual(screen)
    }

    await page.goto('/items/new')
    await page.getByLabel(t.title).fill('Unbreakable'.repeat(30))
    await page.getByLabel(t.note).fill(`${'A note that goes on for longer than any phone is wide. '.repeat(4)}\n${'x'.repeat(300)}`)
    await page.getByRole('button', { name: t.save }).click()
    await expect(page).toHaveURL(/\/items\/unbreakable/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await fits('the item page')

    await page.getByRole('link', { name: t.edit }).click()
    await expect(page.getByRole('heading', { level: 1, name: t.editItem })).toBeVisible()
    await fits('the edit form')

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: t.items })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(buildDemoItems().length + 1)
    await fits('the list')

    await page.goto('/items/new')
    await expect(page.getByRole('heading', { level: 1, name: t.newItem })).toBeVisible()
    await fits('the new item form')

    await page.goto('/design')
    await expect(page.getByRole('heading', { level: 1, name: t.design })).toBeVisible()
    await fits('/design')
  })
}

test('a card shows the first line of the note only', async ({ page }) => {
  const item = buildDemoItems().find((i) => i.note.includes('\n'))!
  const [first, second] = item.note.split('\n')
  await page.goto('/')
  const card = page.getByRole('link', { name: item.title })
  await expect(card).toContainText(first!)
  await expect(card).not.toContainText(second!)
})

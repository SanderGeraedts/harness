import { expect, type Page } from '@playwright/test'
import { KEYS } from '../src/sync/state'
import { t } from '../src/text'

// Helpers for the `production` tests: the throwaway backend's side of things, done as the
// Engineer would in the admin screen, and what several tests do in the app.
// These make accounts and records: they refuse any backend that isn't on this machine.

export const backendUrl = process.env.E2E_BACKEND_URL ?? ''
const SU_EMAIL = process.env.BACKEND_TEST_SUPERUSER_EMAIL ?? 'admin@throwaway.invalid'
const SU_PASSWORD = process.env.BACKEND_TEST_SUPERUSER_PASSWORD ?? 'throwaway-only-password'
export const PASSWORD = 'throwaway-only-password'
/** The name of the app's database on a device (src/db/db.ts). */
export const DB_NAME = '__PROJECT_NAME__'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** One request to the backend. Waits and tries again on 429: the rate limits are on. */
async function api<T>(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<T> {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(backendUrl)) throw new Error(`"${backendUrl}" is not a throwaway backend on this machine`)
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${backendUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: options.token } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
    if (response.status === 429 && attempt < 15) {
      await pause(1500)
      continue
    }
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
    return (await response.json()) as T
  }
}

let superuser: Promise<string> | undefined
const superuserToken = () =>
  (superuser ??= api<{ token: string }>('POST', '/api/collections/_superusers/auth-with-password', {
    body: { identity: SU_EMAIL, password: SU_PASSWORD },
  }).then((r) => r.token))

export interface Account {
  id: string
  email: string
}

let made = 0
/** A new account, made as the Engineer does. `name` is the part of the e-mail before the @. */
export async function makeAccount(name = `e2e-${Date.now()}-${process.pid}-${++made}`): Promise<Account> {
  const email = `${name}@throwaway.invalid`
  const record = await api<{ id: string }>('POST', '/api/collections/users/records', {
    token: await superuserToken(),
    body: { email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true },
  })
  return { id: record.id, email }
}

/** An e-mail name that makes the whole address `length` characters, without a place to break. */
export const longName = (length: number) => `${Date.now()}${process.pid}${++made}`.padEnd(length - '@throwaway.invalid'.length, 'x')

/** Changes an account's password, which ends every sign-in it has. */
export async function changePassword(account: Account, password: string): Promise<void> {
  await api('PATCH', `/api/collections/users/records/${account.id}`, { token: await superuserToken(), body: { password, passwordConfirm: password } })
}

/** The titles of an account's items on the backend that aren't deleted. */
export async function titlesOnBackend(account: Account): Promise<string[]> {
  const filter = encodeURIComponent(`owner = "${account.id}" && deletedAt = ""`)
  const list = await api<{ items: { title: string }[] }>('GET', `/api/collections/items/records?perPage=200&filter=${filter}`, { token: await superuserToken() })
  return list.items.map((i) => i.title).sort()
}

/**
 * Answers the app's request for persistent storage, which a test browser otherwise refuses.
 * Call before the page loads.
 */
export async function answerStorageRequest(page: Page, answer: boolean): Promise<void> {
  await page.addInitScript((value) => {
    Object.defineProperty(StorageManager.prototype, 'persist', { value: async () => value })
  }, answer)
}

/** Fills in the sign-in form and sends it, again when the backend says "too many tries". */
export async function signIn(page: Page, account: Account, password = PASSWORD): Promise<void> {
  const form = page.getByRole('form', { name: t.signIn })
  if ((await form.getByLabel(t.email).getAttribute('readonly')) === null) await form.getByLabel(t.email).fill(account.email)
  for (let attempt = 0; ; attempt++) {
    await form.getByLabel(t.password).fill(password)
    await form.getByRole('button', { name: t.signIn }).click()
    const outcome = await Promise.race([
      form.waitFor({ state: 'detached' }).then(() => 'in' as const),
      form.getByRole('alert').waitFor().then(() => 'alert' as const),
    ])
    if (outcome === 'in') return
    const alert = await form.getByRole('alert').textContent()
    if (alert !== t.signInFailed || attempt >= 8) throw new Error(`signing in as ${account.email}: ${alert}`)
    await pause(2000)
  }
}

/** Opens `path` on a signed-out device and signs in. */
export async function openSignedIn(page: Page, account: Account, path = '/'): Promise<void> {
  await answerStorageRequest(page, true)
  await page.goto(path)
  await signIn(page, account)
  await expect(page.getByRole('link', { name: t.account })).toBeVisible()
}

/** Makes an item through the app's own form, and comes back to the list. */
export async function addItem(page: Page, title: string): Promise<void> {
  // By the header's title, not a new address: this also works offline.
  await page.getByRole('banner').getByRole('link').first().click()
  await page.getByRole('link', { name: t.newItem }).click()
  await page.getByLabel(t.title).fill(title)
  await page.getByRole('button', { name: t.save }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await page.getByRole('link', { name: t.backToItems }).click()
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible()
}

/** The sync status, by its name. */
export const syncRegion = (page: Page) => page.getByRole('region', { name: t.sync })

/** The line of the sync status: a button, or a link once the sign-in ended. */
export const syncLineOf = (page: Page) => syncRegion(page).locator('button[aria-expanded], a').first()

/** The words of the line, without the mark that says it opens. */
export const syncWordsOf = (page: Page) => syncLineOf(page).locator('span').first()

/**
 * Waits until the backend holds exactly these items of the account, and the app says so. The
 * line alone could still read "All synced" from before a change that was made a moment ago.
 */
export async function expectSynced(page: Page, account: Account, titles: string[]): Promise<void> {
  await expect.poll(() => titlesOnBackend(account), { timeout: 15_000 }).toEqual([...titles].sort())
  await expect(syncWordsOf(page)).toHaveText(t.syncAllSynced)
}

/** How many rows a table of the device's database holds. */
export async function countOnDevice(page: Page, table: 'items' | 'outbox'): Promise<number> {
  return page.evaluate(
    ([name, store]) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open(name!)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const request = open.result.transaction(store!).objectStore(store!).count()
          request.onsuccess = () => {
            open.result.close()
            resolve(request.result)
          }
          request.onerror = () => reject(request.error)
        }
      }),
    [DB_NAME, table],
  )
}

/** Makes the device's token one whose date passed a minute ago: a sign-in that ended by itself. */
export async function letTokenRunOut(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as { token?: string; record?: unknown }
    const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: Math.floor(Date.now() / 1000) - 60, type: 'auth' })}.x`
    localStorage.setItem(key, JSON.stringify({ ...stored, token }))
  }, KEYS.token)
}

/** Soft, so one run names every screen that is too wide. */
export async function expectToFit(page: Page, what: string): Promise<void> {
  const { page: pageWidth, screen } = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }))
  expect.soft(pageWidth, `${what} is ${pageWidth}px wide on a ${screen}px screen`).toBeLessThanOrEqual(screen)
}

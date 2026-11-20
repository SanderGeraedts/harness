import { expect, test } from '@playwright/test'
import { t } from '../src/text'

// Outside production the app never signs in and never syncs (G-0019): this is the build
// every preview, the dev server and CI run. The sign-in and sync themselves are tested in
// e2e/production/, against a throwaway backend. Here: that they are absent, and that every
// one of their components is on /design in each of its states (D-0003).

test('there is no sign-in, no "Account" link, and /account is "Not found"', async ({ page, baseURL }) => {
  const elsewhere: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL!).origin) elsewhere.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText(t.demoBanner)
  await expect(page.getByRole('heading', { level: 1, name: t.items })).toBeVisible()
  await expect(page.getByRole('heading', { name: t.signIn })).toHaveCount(0)
  await expect(page.getByRole('link', { name: t.account })).toHaveCount(0)
  await expect(page.getByRole('region', { name: t.sync })).toHaveCount(0)

  await page.goto('/account')
  await expect(page.getByRole('heading', { level: 1, name: t.notFound })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(t.demoBanner)
  // Nothing left this origin.
  expect(elsewhere).toEqual([])
})

test('/design shows the sync status in each of its states, with the count in singular and plural', async ({ page }) => {
  await page.goto('/design')
  // /design loads after the page does: every check waits for what it looks at.
  const words = page.getByRole('region', { name: t.sync }).locator('button[aria-expanded] > span:first-child, a > span')
  for (const line of [
    t.syncAllSynced,
    t.syncChanges(1),
    t.syncChanges(1234),
    t.syncOfflineIdle,
    `${t.syncOffline}${t.joiner}${t.syncChanges(3)}`,
    t.syncFailed,
    `${t.syncFailed}${t.joiner}${t.syncChanges(3)}`,
    t.syncStorage,
    t.syncSignInAgain,
    `${t.syncChanges(3)}${t.joiner}${t.syncSignInAgain}`,
  ])
    await expect(words.getByText(line, { exact: true }).first()).toBeVisible()

  // The line that asks to sign in again is a link to /account, with nothing to open.
  const again = page.getByRole('region', { name: t.sync }).getByRole('link', { name: t.syncSignInAgain, exact: true })
  await expect(again).toHaveAttribute('href', '/account')

  // The details: the last sync, the last error with its time, and "Sync now".
  const open = page.getByRole('region', { name: t.sync }).filter({ has: page.getByText(t.syncNever) }).first()
  for (const text of [t.syncStatusLabel, t.syncLast, t.syncNever, t.syncErrorNoConnection, t.syncOfflineDetail, t.syncStorageDetail]) await expect(open.getByText(text, { exact: true })).toBeVisible()
  await expect(open.getByRole('button', { name: t.syncNow })).toBeDisabled()
  await expect(page.getByRole('button', { name: t.syncing })).toBeDisabled()

  // A closed line opens and closes its details.
  const closed = page.getByRole('region', { name: t.sync }).filter({ hasText: t.syncAllSynced }).first()
  const line = closed.getByRole('button', { name: t.syncAllSynced })
  // A mark at its end says that it opens; it is not read out, and the details it controls
  // are in the page while closed, hidden.
  const mark = line.locator('span[aria-hidden="true"]')
  const details = page.locator(`[id="${await line.getAttribute('aria-controls')}"]`)
  await expect(mark).toHaveText('▾')
  await expect(details).toBeHidden()
  await expect(details).toHaveCount(1)
  await expect(again.locator('[aria-hidden]')).toHaveCount(0)
  await line.click()
  await expect(line).toHaveAttribute('aria-expanded', 'true')
  await expect(mark).toHaveText('▴')
  await expect(details).toBeVisible()
  await expect(closed.getByRole('button', { name: t.syncNow })).toBeEnabled()
  await expect(closed.getByText(t.syncLast)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(line).toHaveAttribute('aria-expanded', 'false')
  await expect(line).toBeFocused()
})

test('/design shows the sign-in form and signing out in each of their states', async ({ page }) => {
  await page.goto('/design')
  const forms = page.getByRole('form', { name: t.signIn })
  await expect(forms).toHaveCount(4)
  // Empty, with an error, busy, and with the read-only e-mail.
  await expect(forms.nth(0).getByLabel(t.email)).toHaveValue('')
  await expect(forms.nth(0).getByText(t.signInNoAccount)).toBeVisible()
  await expect(forms.nth(1).getByRole('alert')).toHaveText(t.signInWrong)
  await expect(forms.nth(2).getByRole('button', { name: t.signingIn })).toBeDisabled()
  await expect(forms.nth(3).getByLabel(t.email)).toHaveAttribute('readonly')
  await expect(forms.nth(3).getByText(t.signInNoAccount)).toHaveCount(0)

  // Signing out: at rest in both looks, and the question with one change and with many.
  await expect(page.getByText(t.signOutHint).first()).toBeVisible()
  await expect(page.getByText(t.otherAccount)).toBeVisible()
  await expect(page.getByText(t.signOutUnsynced(1))).toBeVisible()
  await expect(page.getByText(t.signOutUnsynced(1234))).toBeVisible()
  await expect(page.getByRole('button', { name: t.signOutAnyway })).toHaveCount(2)
  await expect(page.getByText(t.signInEnded)).toBeVisible()
})

import { expect, test } from '@playwright/test'
import { t } from '../../src/text'
import { addItem, answerStorageRequest, backendUrl, expectSynced, makeAccount, openSignedIn, signIn, syncLineOf, syncWordsOf, syncRegion, titlesOnBackend } from '../backend'

// Sync between two devices of one account, and what the sync status says (D-0007).

test('an item made on one page appears on another, and a change comes back', async ({ page, browser }) => {
  const account = await makeAccount()
  await openSignedIn(page, account)
  await addItem(page, 'Made on the first device')
  await expectSynced(page, account, ['Made on the first device'])

  // A second device: its own storage, the same account.
  const second = await (await browser.newContext()).newPage()
  await openSignedIn(second, account, page.url())
  await expect(second.getByRole('heading', { level: 2, name: 'Made on the first device' })).toBeVisible()

  // A change on the second device reaches the first with "Sync now".
  await second.getByRole('link', { name: 'Made on the first device' }).click()
  await second.getByRole('link', { name: t.edit }).click()
  await second.getByLabel(t.title).fill('Changed on the second device')
  await second.getByRole('button', { name: t.save }).click()
  await expectSynced(second, account, ['Changed on the second device'])

  await syncLineOf(page).click()
  await syncRegion(page).getByRole('button', { name: t.syncNow }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Changed on the second device' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Made on the first device' })).toHaveCount(0)
  await second.context().close()
})

test('the sync line says offline, what waits, and that everything is synced again', async ({ page, context }) => {
  const account = await makeAccount()
  await openSignedIn(page, account)
  const line = syncLineOf(page)
  const words = syncWordsOf(page)
  await expect(words).toHaveText(t.syncAllSynced)
  await expect(line).toHaveAttribute('aria-expanded', 'false')

  await context.setOffline(true)
  await expect(words).toHaveText(t.syncOfflineIdle)
  await addItem(page, 'Made offline')
  await expect(words).toHaveText(`${t.syncOffline}${t.joiner}${t.syncChanges(1)}`)
  await addItem(page, 'Also made offline')
  await expect(words).toHaveText(`${t.syncOffline}${t.joiner}${t.syncChanges(2)}`)

  // The details: label above value, the offline line, and "Sync now" that can't run.
  await line.click()
  await expect(line).toHaveAttribute('aria-expanded', 'true')
  const details = page.locator(`[id="${await line.getAttribute('aria-controls')}"]`)
  await expect(details.getByText(t.syncStatusLabel)).toBeVisible()
  await expect(details.getByText(t.syncChanges(2))).toBeVisible()
  await expect(details.getByText(t.syncLast)).toBeVisible()
  await expect(details.getByText(t.syncNever)).toHaveCount(0)
  await expect(details.getByText(t.syncOfflineDetail)).toBeVisible()
  await expect(details.getByRole('button', { name: t.syncNow })).toBeDisabled()
  // Escape closes them, and the focus is on the line.
  await page.keyboard.press('Escape')
  await expect(details).toBeHidden()
  await expect(line).toBeFocused()
  await expect(line).toHaveAttribute('aria-expanded', 'false')

  await context.setOffline(false)
  await expect(words).toHaveText(t.syncAllSynced)
  expect(await titlesOnBackend(account)).toEqual(['Also made offline', 'Made offline'])
})

test('a sync that failed says so, with the last error in words, and "Sync now" tries again', async ({ page }) => {
  const account = await makeAccount()
  await openSignedIn(page, account)
  const line = syncLineOf(page)
  const words = syncWordsOf(page)
  await expect(words).toHaveText(t.syncAllSynced)

  // The device is online, but the backend can't be reached.
  await page.route(`${backendUrl}/**`, (route) => route.abort())
  await addItem(page, 'Waits for the backend')
  await expect(words).toHaveText(`${t.syncFailed}${t.joiner}${t.syncChanges(1)}`, { timeout: 15_000 })
  await line.click()
  await expect(syncRegion(page).getByText(t.syncLastError)).toBeVisible()
  await expect(syncRegion(page).getByText(t.syncErrorNoConnection)).toBeVisible()
  // Never a status code or a raw message.
  await expect(syncRegion(page)).not.toContainText(/fetch|\b[45]\d\d\b|Error/)

  await page.unroute(`${backendUrl}/**`)
  await syncRegion(page).getByRole('button', { name: t.syncNow }).click()
  await expect(words).toHaveText(t.syncAllSynced)
  await expect(syncRegion(page).getByText(t.syncLastError)).toHaveCount(0)
  expect(await titlesOnBackend(account)).toEqual(['Waits for the backend'])
})

test('the storage line shows only when the browser refused persistent storage', async ({ page }) => {
  const account = await makeAccount()
  await answerStorageRequest(page, false)
  await page.goto('/')
  await signIn(page, account)
  const line = syncLineOf(page)
  const words = syncWordsOf(page)
  await expect(words).toHaveText(t.syncStorage)
  await line.click()
  await expect(syncRegion(page).getByText(t.syncStorageDetail)).toBeVisible()
  // It is the lowest rule: a change that waits is said first.
  await page.route(`${backendUrl}/**`, (route) => route.abort())
  await addItem(page, 'Waits')
  await expect(words).toContainText(t.syncChanges(1))
})

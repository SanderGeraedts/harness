import { expect, test } from '@playwright/test'
import { t } from '../../src/text'
import {
  addItem,
  answerStorageRequest,
  changePassword,
  countOnDevice,
  expectSynced,
  expectToFit,
  letTokenRunOut,
  longName,
  makeAccount,
  openSignedIn,
  signIn,
  syncLineOf,
  syncRegion,
  titlesOnBackend,
} from '../backend'

// The account screen: signing out, and a sign-in that ended (D-0009, D-0010).

const accountLink = (page: import('@playwright/test').Page) => page.getByRole('link', { name: t.account })

test('signing out syncs first, then empties the device and shows the sign-in screen', async ({ page }) => {
  const account = await makeAccount()
  await openSignedIn(page, account)
  await addItem(page, 'Synced before signing out')
  await accountLink(page).click()
  await expect(page.getByRole('heading', { level: 1, name: t.account })).toBeVisible()
  await expect(page.getByText(t.signedInAs(account.email))).toBeVisible()
  await expect(page.getByText(t.signOutHint)).toBeVisible()

  // The change is at most a moment old; signing out sends it before anything is removed.
  await page.getByRole('button', { name: t.signOut }).click()
  await expect(page.getByRole('heading', { level: 1, name: t.signIn })).toBeFocused()
  await expect(page).toHaveURL('/')
  await expect(accountLink(page)).toHaveCount(0)
  await expect(syncRegion(page)).toHaveCount(0)
  expect(await countOnDevice(page, 'items')).toBe(0)
  expect(await countOnDevice(page, 'outbox')).toBe(0)
  expect(await titlesOnBackend(account)).toEqual(['Synced before signing out'])

  // Signed in again, the item comes back from the backend.
  await signIn(page, account)
  await expect(page.getByRole('heading', { level: 2, name: 'Synced before signing out' })).toBeVisible()
})

test("with a change that can't sync, signing out asks first and names the number", async ({ page, context }) => {
  const account = await makeAccount()
  await openSignedIn(page, account)
  await addItem(page, 'Synced')
  await expectSynced(page, account, ['Synced'])

  await context.setOffline(true)
  await addItem(page, 'Made offline')
  await accountLink(page).click()
  await page.getByRole('button', { name: t.signOut }).click()

  // The question, in place; the focus on the safe answer.
  const question = page.getByRole('alert')
  await expect(question).toContainText(t.signOutUnsynced(1))
  await expect(question.getByRole('button', { name: t.cancel })).toBeFocused()
  await expect(page.getByText(t.signOutHint)).toHaveCount(0)

  // "Cancel" leaves every item and the outbox as they were.
  await question.getByRole('button', { name: t.cancel }).click()
  await expect(page.getByRole('button', { name: t.signOut })).toBeFocused()
  expect(await countOnDevice(page, 'items')).toBe(2)
  expect(await countOnDevice(page, 'outbox')).toBe(1)
  await expect(page.getByText(t.signedInAs(account.email))).toBeVisible()

  // "Sign out anyway" empties the device.
  await page.getByRole('button', { name: t.signOut }).click()
  await page.getByRole('alert').getByRole('button', { name: t.signOutAnyway }).click()
  await expect(page.getByRole('heading', { level: 1, name: t.signIn })).toBeVisible()
  await expect(page.getByText(t.signInOffline)).toBeVisible()
  expect(await countOnDevice(page, 'items')).toBe(0)
  expect(await countOnDevice(page, 'outbox')).toBe(0)

  await context.setOffline(false)
  expect(await titlesOnBackend(account)).toEqual(['Synced'])
})

test('a sign-in the backend ended never puts the sign-in screen in place of the app, and signing in again sends what waited', async ({ page }) => {
  const account = await makeAccount()
  await openSignedIn(page, account)
  await addItem(page, 'Before')
  await expectSynced(page, account, ['Before'])

  // The Engineer changes the password: the backend refuses the sign-in from now on.
  const changed = 'another-throwaway-password'
  await changePassword(account, changed)

  // An item can still be made and changed. The sync that follows finds the sign-in ended.
  await addItem(page, 'Made after the sign-in ended')
  const line = syncLineOf(page)
  await expect(line).toHaveText(`${t.syncChanges(1)}${t.joiner}${t.syncSignInAgain}`, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1, name: t.items })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: t.signIn })).toHaveCount(0)
  await page.getByRole('link', { name: 'Made after the sign-in ended' }).click()
  await page.getByRole('link', { name: t.edit }).click()
  await page.getByLabel(t.title).fill('Changed after the sign-in ended')
  await page.getByRole('button', { name: t.save }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Changed after the sign-in ended' })).toBeVisible()
  await expect(line).toHaveText(`${t.syncChanges(2)}${t.joiner}${t.syncSignInAgain}`)

  // The line is a link to /account, with nothing to open.
  await expect(line).not.toHaveAttribute('aria-expanded')
  await line.click()
  await expect(page).toHaveURL('/account')
  await expect(page.getByText(t.signInEnded)).toBeVisible()
  await expect(page.getByText(t.otherAccount)).toBeVisible()
  await expect(page.getByText(t.signedInAs(account.email))).toHaveCount(0)
  // Only the same account signs in again (D-0010): its e-mail can't be changed.
  const email = page.getByRole('form', { name: t.signIn }).getByLabel(t.email)
  await expect(email).toHaveValue(account.email)
  await expect(email).toHaveAttribute('readonly')
  await expect(page.getByText(t.signInNoAccount)).toHaveCount(0)

  await signIn(page, account, changed)
  await expect(page.getByText(t.signedInAs(account.email))).toBeVisible()
  await expect(syncLineOf(page)).toHaveText(t.syncAllSynced)
  expect(await titlesOnBackend(account)).toEqual(['Before', 'Changed after the sign-in ended'])
})

test('a sign-in whose date passed, on a device that is offline, changes nothing but the sync line', async ({ page, context }) => {
  const account = await makeAccount()
  await openSignedIn(page, account)
  await addItem(page, 'Before')
  await expectSynced(page, account, ['Before'])

  // The service worker has the app, so it opens with no connection.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await letTokenRunOut(page)
  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: t.items })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Before' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: t.signIn })).toHaveCount(0)
  await expect(syncLineOf(page)).toHaveText(t.syncSignInAgain)
  await addItem(page, 'Made offline, after the date passed')
  await expect(syncLineOf(page)).toHaveText(`${t.syncChanges(1)}${t.joiner}${t.syncSignInAgain}`)

  // The account screen is the same offline; signing in needs the backend.
  await syncLineOf(page).click()
  await expect(page.getByText(t.signInEnded)).toBeVisible()
  const form = page.getByRole('form', { name: t.signIn })
  await form.getByLabel(t.password).fill('whatever')
  await form.getByRole('button', { name: t.signIn }).click()
  await expect(form.getByRole('alert')).toHaveText(t.signInNoConnection)

  // It can't sync first, so signing out asks at once.
  await page.getByRole('button', { name: t.signOut }).click()
  await expect(page.getByRole('alert').filter({ hasText: t.signOutUnsynced(1) })).toBeVisible()
  await page.getByRole('button', { name: t.cancel }).click()
  expect(await countOnDevice(page, 'items')).toBe(2)
  await context.setOffline(false)
})

test('no screen of the sign-in and the account is wider than a 320px phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await answerStorageRequest(page, true)
  // An e-mail of 60 characters without a place to break.
  const account = await makeAccount(longName(60))
  expect(account.email).toHaveLength(60)

  // The sign-in screen, with the offline line and an error at once.
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: t.signIn })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  const form = page.getByRole('form', { name: t.signIn })
  await form.getByLabel(t.email).fill(account.email)
  await form.getByLabel(t.password).fill('whatever')
  await form.getByRole('button', { name: t.signIn }).click()
  await expect(form.getByRole('alert')).toHaveText(t.signInNoConnection)
  await expect(page.getByText(t.signInOffline)).toBeVisible()
  await expectToFit(page, 'the sign-in screen with the offline line and an error')
  await context.setOffline(false)

  // Signed in: the header with "Account", and the open sync details.
  await signIn(page, account)
  await expect(page.getByRole('link', { name: t.account })).toBeVisible()
  await expectToFit(page, 'the list with "Account" in the header')
  await addItem(page, 'Synced')
  await expectSynced(page, account, ['Synced'])
  await context.setOffline(true)
  await addItem(page, 'Made offline')
  await syncLineOf(page).click()
  await expect(syncRegion(page).getByRole('button', { name: t.syncNow })).toBeVisible()
  await expectToFit(page, 'the open sync details')
  await page.keyboard.press('Escape')

  // The account screen, signed in, and the sign-out question.
  await page.getByRole('link', { name: t.account }).click()
  await expect(page.getByText(t.signedInAs(account.email))).toBeVisible()
  await expectToFit(page, 'the account screen, signed in')
  await page.getByRole('button', { name: t.signOut }).click()
  await expect(page.getByRole('alert')).toContainText(t.signOutUnsynced(1))
  await expectToFit(page, 'the sign-out question')
  await page.getByRole('button', { name: t.cancel }).click()

  // The account screen after the sign-in ended.
  await letTokenRunOut(page)
  await page.reload()
  await expect(page.getByText(t.signInEnded)).toBeVisible()
  await expect(syncLineOf(page)).toHaveText(`${t.syncChanges(1)}${t.joiner}${t.syncSignInAgain}`)
  await expectToFit(page, 'the account screen after the sign-in ended')
  await context.setOffline(false)
})

import { expect, test } from '@playwright/test'
import { t } from '../../src/text'
import { answerStorageRequest, backendUrl, makeAccount, PASSWORD, signIn, syncLineOf, syncRegion } from '../backend'

// A production build that was given a backend address, signed out (D-0009): the sign-in
// screen stands in place of every screen.

test('signed out, every address shows the sign-in screen and nothing of the app', async ({ page }) => {
  for (const path of ['/', '/items/new', '/items/some-item', '/account', '/no/such/page']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: t.signIn })).toBeVisible()
    await expect(page.getByText(t.signInIntro)).toBeVisible()
    await expect(page.getByText(t.signInNoAccount)).toBeVisible()
    // The address stays, so after signing in the user is where they wanted to be.
    await expect(page).toHaveURL(path)
    await expect(page.getByRole('link', { name: t.account })).toHaveCount(0)
    await expect(page.getByRole('link', { name: t.newItem })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: t.items })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: t.notFound })).toHaveCount(0)
    await expect(syncRegion(page)).toHaveCount(0)
    await expect(page.getByText(t.demoBanner)).toHaveCount(0)
  }
})

test("an empty field, a wrong password and a backend that can't be reached each say so, and none clears the e-mail", async ({ page }) => {
  const account = await makeAccount()
  await page.goto('/')
  const form = page.getByRole('form', { name: t.signIn })
  const email = form.getByLabel(t.email)
  const password = form.getByLabel(t.password)
  const send = form.getByRole('button', { name: t.signIn })
  await expect(email).toHaveAttribute('type', 'email')
  await expect(email).toHaveAttribute('autocomplete', 'username')
  await expect(password).toHaveAttribute('autocomplete', 'current-password')

  // Nothing filled in: the project's own words, and the focus on the first empty field.
  await send.click()
  await expect(form.getByRole('alert')).toHaveText(t.signInEmpty)
  await expect(email).toBeFocused()
  await email.fill(account.email)
  await send.click()
  await expect(form.getByRole('alert')).toHaveText(t.signInEmpty)
  await expect(password).toBeFocused()
  await expect(email).toHaveValue(account.email)

  // No answer from the backend: both fields keep their values.
  await page.route(`${backendUrl}/**`, (route) => route.abort())
  await password.fill(PASSWORD)
  await send.click()
  await expect(form.getByRole('alert')).toHaveText(t.signInNoConnection)
  await expect(email).toHaveValue(account.email)
  await expect(password).toHaveValue(PASSWORD)
  await page.unroute(`${backendUrl}/**`)

  // A wrong password: the password is emptied and gets the focus; the e-mail stays.
  await expect(async () => {
    await password.fill('not the password')
    await send.click()
    await expect(form.getByRole('alert')).toHaveText(t.signInWrong, { timeout: 5000 })
  }).toPass({ intervals: [2500] }) // "too many tries" answers differently; try again
  await expect(password).toHaveValue('')
  await expect(password).toBeFocused()
  await expect(email).toHaveValue(account.email)
  // The error belongs to the form.
  await expect(form).toHaveAttribute('aria-describedby', (await form.getByRole('alert').getAttribute('id'))!)
  await expect(page.getByRole('heading', { level: 1, name: t.signIn })).toBeVisible()
})

test('after signing in the screen of the address appears, with the focus on its heading, and the first sync starts', async ({ page }) => {
  const account = await makeAccount()
  await answerStorageRequest(page, true)
  // The backend answers slowly, so the first sync is still under way when the list shows.
  await page.route(`${backendUrl}/api/collections/items/**`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto('/')
  await signIn(page, account)
  await expect(page.getByRole('heading', { level: 1, name: t.items })).toBeFocused()
  await expect(page.getByText(t.fetchingItems)).toBeVisible()
  await expect(page.getByText(t.noItems)).toBeVisible()
  await expect(page.getByText(t.fetchingItems)).toHaveCount(0)
  await expect(syncLineOf(page)).toHaveText(t.syncAllSynced)

  const account_ = page.getByRole('link', { name: t.account })
  await expect(account_).toBeVisible()
  await account_.click()
  await expect(account_).toHaveAttribute('aria-current', 'page')
})

test('signing in at another address lands on that address', async ({ page }) => {
  const account = await makeAccount()
  await page.goto('/items/new')
  await signIn(page, account)
  await expect(page).toHaveURL('/items/new')
  await expect(page.getByRole('heading', { level: 1, name: t.newItem })).toBeFocused()
})

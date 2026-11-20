import type { ItemStatus } from './db/db'

// D-0004: every word a user reads lives here, in the project's language. Screens take their
// text from `t`; the end-to-end tests do too, so they keep passing when this is translated.
// Where a number or a name is part of a sentence the entry is a function, so a translation
// can order its own words. Two parts of a line are joined with `t.joiner`.

export const t = {
  appTitle: __PROJECT_TITLE_JSON__ as string,
  demoBanner: 'Demo data · sync is off',
  offlineOnly: 'Only on this device · sync is not set up',
  joiner: ' · ',
  items: 'Items',
  newItem: 'New item',
  editItem: 'Edit item',
  noItems: 'Nothing here yet. Add the first item.',
  fetchingItems: 'Fetching your items…',
  backToItems: 'All items',
  title: 'Title',
  note: 'Note',
  noteHint: 'Optional.',
  status: 'Status',
  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
  deleteQuestion: 'Delete this item?',
  deleteConfirm: 'Yes, delete',
  titleMissing: 'Give the item a title.',
  saveFailed: 'That could not be saved. Try again.',
  notFound: 'Not found',
  design: 'Design',
  designIntro: 'The tokens and components every screen is built from.',
  colours: 'Colours',
  type: 'Type',
  components: 'Components',
  statuses: { open: 'open', doing: 'doing', done: 'done' } satisfies Record<ItemStatus, string>,

  // Signing in and out (D-0006, D-0009, D-0010).
  account: 'Account',
  signIn: 'Sign in',
  signInIntro: 'Sign in to see your items and keep them the same on every device.',
  signInOffline: 'You are offline. Signing in needs a connection.',
  email: 'E-mail',
  password: 'Password',
  signingIn: 'Signing in…',
  signInEmpty: 'Enter your e-mail and password.',
  signInWrong: "That e-mail and password don't match.",
  signInNoConnection: "Couldn't reach the server. Check your connection and try again.",
  signInFailed: "Signing in didn't work. Try again in a moment.",
  signInNoAccount: 'No account yet? Ask whoever runs this app.',
  signedInAs: (email: string) => `Signed in as ${email}.`,
  signOut: 'Sign out',
  signOutHint: 'Signing out syncs first, then removes everything from this device.',
  signingOut: 'Signing out…',
  signOutUnsynced: (n: number) =>
    n === 1
      ? "1 change hasn't synced. Signing out removes it from this device for good."
      : `${n} changes haven't synced. Signing out removes them from this device for good.`,
  signOutAnyway: 'Sign out anyway',
  signInEnded: 'Your sign-in has ended. Everything on this device stays and can still be changed. Sign in again to sync.',
  otherAccount: 'Want to use another account? Sign out first.',

  // The sync status (D-0007).
  sync: 'Sync',
  syncAllSynced: 'All synced',
  syncChanges: (n: number) => (n === 1 ? '1 change not synced' : `${n} changes not synced`),
  syncOffline: 'Offline',
  syncOfflineIdle: 'Offline · changes sync later',
  syncFailed: 'Sync failed',
  syncSignInAgain: 'Sign in again to sync',
  syncStorage: 'Storage not protected',
  syncStatusLabel: 'Status',
  syncLast: 'Last synced',
  syncNever: 'Not yet on this device',
  syncLastError: 'Last error',
  syncErrorNoConnection: "Couldn't reach the server.",
  syncErrorOther: 'Something went wrong while syncing.',
  syncOfflineDetail: 'You are offline. Changes stay on this device and sync when the connection is back.',
  syncStorageDetail:
    "This browser may clear what is stored on this device when space runs low. Changes that haven't synced would be lost. Install the app to protect it.",
  syncNow: 'Sync now',
  syncing: 'Syncing…',

  // Headings on /design.
  designSync: 'Sync status',
  designSignIn: 'Sign-in form',
  designSignOut: 'Sign out',
}

import type { ItemStatus } from './db/db'

// D-0004: every word a user reads lives here, in the project's language. Screens take their
// text from `t`; the end-to-end tests do too, so they keep passing when this is translated.

export const t = {
  appTitle: __PROJECT_TITLE_JSON__ as string,
  demoBanner: 'Demo data · sync is off',
  offlineOnly: 'Only on this device · sync is not set up',
  items: 'Items',
  newItem: 'New item',
  editItem: 'Edit item',
  noItems: 'Nothing here yet. Add the first item.',
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
  titleTooLong: (max: number) => `Keep the title to ${max} characters.`,
  noteTooLong: (max: number) => `Keep the note to ${max} characters.`,
  saveFailed: 'That could not be saved. Try again.',
  notFound: 'Not found',
  design: 'Design',
  designIntro: 'The tokens and components every screen is built from.',
  colours: 'Colours',
  type: 'Type',
  components: 'Components',
  statuses: { open: 'open', doing: 'doing', done: 'done' } satisfies Record<ItemStatus, string>,
}

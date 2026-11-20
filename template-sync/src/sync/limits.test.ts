import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ITEM_STATUSES, NOTE_MAX, TITLE_MAX } from '../db/db'

// What the write API accepts must be within what the backend's schema accepts: a change the
// backend refuses for good stays at the head of the outbox and holds up every change behind
// it. The limits exist twice, on the device (src/db/db.ts) and in the backend's migration;
// this keeps them the same.

const migration = readFileSync(new URL('../../backend/pb_migrations/1700000000_initial.js', import.meta.url), 'utf8')
/** The line of the migration that defines a field. */
const field = (name: string) => migration.split('\n').find((line) => line.includes(`{ name: "${name}",`)) ?? ''

describe("the backend's schema", () => {
  it('takes a title and a note as long as the device does, and no longer', () => {
    expect(field('title')).toContain(`max: ${TITLE_MAX} }`)
    expect(field('note')).toContain(`max: ${NOTE_MAX} }`)
  })

  it('has the statuses the device has', () => {
    expect(field('status')).toContain(`values: [${ITEM_STATUSES.map((s) => `"${s}"`).join(', ')}]`)
  })
})

/// <reference path="../pb_data/types.d.ts" />
// D-0005: the backend settles slugs. A device picks an item's slug offline, unique among the
// items it knows (src/db/slug.ts); two devices that were offline can pick the same one. On
// every create and update of an item this hook makes the slug unique among the owner's
// other items, deleted ones included, and counts their earlier slugs as taken: the second
// `tea` becomes `tea-2`. The saved record goes back in the answer, and the device takes its
// slug over (src/sync/engine.ts). A rename's previous slug joins `oldSlugs` here too.
//
// The rules are in slug.js. Everything stays inside the handlers: each hook runs in its own
// JavaScript context.
onRecordCreateRequest((e) => {
  if (e.auth) require(`${__hooks}/slug.js`).settleRecord(e.app, e.record, null)
  return e.next()
}, "items")

onRecordUpdateRequest((e) => {
  if (e.auth) require(`${__hooks}/slug.js`).settleRecord(e.app, e.record, e.record.original())
  return e.next()
}, "items")

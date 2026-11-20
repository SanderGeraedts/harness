/// <reference path="../pb_data/types.d.ts" />
// D-0007: per record, the newest `updatedAt` wins, and the backend decides it, so two
// devices can't race each other. An update that carries an older `updatedAt` than the stored
// record is not saved: the answer is the stored record, which the device then takes over
// (src/sync/engine.ts). A newer or equal `updatedAt` saves as usual.
//
// Named to load before slugs.pb.js: an update this hook answers never gets there.
// Everything stays inside the handler: each hook runs in its own JavaScript context.
onRecordUpdateRequest((e) => {
  const stored = e.record.original()
  const incoming = e.record.getString("updatedAt")
  const current = stored.getString("updatedAt")
  // Only the owner's own updates. Anything else goes on to the collection's rules, which
  // refuse it.
  const isOwner = e.auth && e.auth.id === stored.getString("owner")
  if (!isOwner || !incoming || !current || !(Date.parse(incoming) < Date.parse(current))) {
    return e.next()
  }
  return e.json(200, e.app.findRecordById(e.record.collection().name, e.record.id))
}, "items")

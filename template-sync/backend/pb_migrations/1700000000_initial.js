/// <reference path="../pb_data/types.d.ts" />
// The first schema (D-0006, D-0007): accounts with sign-up closed, and the example `items`
// collection with the fields of the app's records (src/db/db.ts).
// Never edit this file once it has run anywhere; add a new migration instead (D-0008).
migrate(
  (app) => {
    // Accounts: only the Engineer makes, changes or removes one, in the admin screen (D-0006).
    // A sign-in lasts 30 days and is renewed by syncing (src/auth/auth.ts).
    const users = app.findCollectionByNameOrId("users")
    users.createRule = null
    users.updateRule = null
    users.deleteRule = null
    users.authToken.duration = 30 * 24 * 60 * 60
    app.save(users)

    // The sign-in path is on the internet: PocketBase's rate limits on.
    const settings = app.settings()
    settings.rateLimits.enabled = true
    app.save(settings)

    // Every record has an owner, and only the owner reads and writes it (D-0006). Nothing is
    // ever removed through the API: a delete is a tombstone (D-0007).
    const OWNER = "owner = @request.auth.id"
    const items = new Collection({
      type: "base",
      name: "items",
      listRule: OWNER,
      viewRule: OWNER,
      createRule: '@request.auth.id != "" && owner = @request.auth.id',
      updateRule: "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
      deleteRule: null,
      fields: [
        { name: "owner", type: "relation", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { name: "title", type: "text", required: true, max: 500 },
        { name: "note", type: "text", max: 20000 },
        // The same values as ITEM_STATUSES in src/db/db.ts.
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["open", "doing", "done"] },
        // The address (D-0005). pb_hooks/slugs.pb.js makes it unique for its owner.
        { name: "slug", type: "text", max: 100, pattern: "^$|^[a-z0-9]+(-[a-z0-9]+)*$" },
        { name: "oldSlugs", type: "json", maxSize: 20000 },
        // The device's own times, as ISO text; `updatedAt` decides which change wins (D-0007).
        { name: "createdAt", type: "text", required: true, max: 64 },
        { name: "updatedAt", type: "text", required: true, max: 64 },
        { name: "deletedAt", type: "text", max: 64 },
        // The backend's own times; devices ask for what changed since `updated`.
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        // Two saves at the same moment can't both take a slug.
        "CREATE UNIQUE INDEX `idx_items_owner_slug` ON `items` (`owner`, `slug`) WHERE `slug` != ''",
        "CREATE INDEX `idx_items_owner_updated` ON `items` (`owner`, `updated`)",
      ],
    })
    app.save(items)

    // A device makes a record's id itself, offline (crypto.randomUUID), and the record keeps
    // it here. PocketBase's default id is 15 characters of [a-z0-9]; also take a UUID.
    const saved = app.findCollectionByNameOrId("items")
    const id = saved.fields.getByName("id")
    id.pattern = "^[a-z0-9-]+$"
    id.min = 15
    id.max = 36
    app.save(saved)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("items"))
    } catch (_) {
      // already gone
    }
    const users = app.findCollectionByNameOrId("users")
    users.createRule = ""
    users.updateRule = "id = @request.auth.id"
    users.deleteRule = "id = @request.auth.id"
    users.authToken.duration = 604800
    app.save(users)
  },
)

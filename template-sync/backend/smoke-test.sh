#!/usr/bin/env bash
# The smoke test of the backend image, run by the backend workflow against a throwaway
# backend on an empty database (backend/throwaway.sh). Needs curl and jq.
# It makes accounts and records: never point it at a real backend (G-0019). It refuses any
# address that isn't this machine.
set -euo pipefail

B=${BACKEND_TEST_URL:-http://127.0.0.1:8090}
# The one origin the backend was started for (--origins).
APP=${APP_ORIGIN:-https://app.example}
SU_EMAIL=${BACKEND_TEST_SUPERUSER_EMAIL:-admin@throwaway.invalid}
SU_PASS=${BACKEND_TEST_SUPERUSER_PASSWORD:-throwaway-only-password}
PASS='throwaway-only-password'

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

case "$B" in
  http://127.0.0.1:* | http://localhost:*) ;;
  *) fail "$B is not on this machine; the smoke test runs against a throwaway backend only" ;;
esac

OUT=$(mktemp)
trap 'rm -f "$OUT"' EXIT

# req METHOD PATH [TOKEN] [JSON]: prints "<status>\n<body>"; waits and tries again on 429
# (the rate limits are on).
req() {
  local method=$1 path=$2 token=${3:-} body=${4:-} code
  local args=(-sS -o "$OUT" -w '%{http_code}' -X "$method" "$B$path")
  [ -n "$token" ] && args+=(-H "Authorization: $token")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  for _ in 1 2 3 4 5 6; do
    code=$(curl "${args[@]}")
    [ "$code" != 429 ] && break
    sleep 3
  done
  echo "$code"
  cat "$OUT"
}
status() { head -n1 <<<"$1"; }
body() { tail -n +2 <<<"$1"; }
expect() { # expect RESPONSE CODE WHAT
  [ "$(status "$1")" = "$2" ] || fail "$3: expected $2, got $(status "$1"): $(body "$1")"
}
refused() { # refused RESPONSE WHAT: anything but a 2xx
  case "$(status "$1")" in 2*) fail "$2: got $(status "$1"): $(body "$1")" ;; esac
}
token() { # token COLLECTION EMAIL PASSWORD
  local r
  r=$(req POST "/api/collections/$1/auth-with-password" "" "{\"identity\":\"$2\",\"password\":\"$3\"}")
  expect "$r" 200 "sign in to $1 as $2"
  body "$r" | jq -r .token
}

SU=$(token _superusers "$SU_EMAIL" "$SU_PASS")

# --- Every collection exists, with the settings the decisions ask for. ---
for c in users items; do
  expect "$(req GET "/api/collections/$c" "$SU")" 200 "the collection $c"
done
users=$(body "$(req GET /api/collections/users "$SU")")
[ "$(jq -c '[.createRule,.updateRule,.deleteRule]' <<<"$users")" = '[null,null,null]' ] ||
  fail "users can be made, changed or removed without the Engineer: $(jq -c '[.createRule,.updateRule,.deleteRule]' <<<"$users")"
items=$(body "$(req GET /api/collections/items "$SU")")
[ "$(jq -c '.fields[] | select(.name=="status") | .values' <<<"$items")" = '["open","doing","done"]' ] || fail "items.status values"
[ "$(jq -r .deleteRule <<<"$items")" = null ] || fail "items can be removed through the API"
jq -r '.indexes[]' <<<"$items" | grep -q 'UNIQUE INDEX `idx_items_owner_slug`' || fail "no unique index on an owner's slugs"
[ "$(body "$(req GET /api/settings "$SU")" | jq -r .rateLimits.enabled)" = true ] || fail "the rate limits are off"
ok "the collections users and items exist; accounts are the Engineer's; rate limits are on"

# --- Sign-up is closed (D-0006). ---
r=$(req POST /api/collections/users/records "" "{\"email\":\"walk-in@throwaway.invalid\",\"password\":\"$PASS\",\"passwordConfirm\":\"$PASS\"}")
refused "$r" "a visitor made an account"
ok "sign-up is closed ($(status "$r"))"

# Two accounts, made by the superuser as the Engineer does in the admin screen.
mkuser() {
  local r
  r=$(req POST /api/collections/users/records "$SU" "{\"email\":\"$1\",\"password\":\"$PASS\",\"passwordConfirm\":\"$PASS\",\"verified\":true}")
  expect "$r" 200 "make the account $1"
  body "$r" | jq -r .id
}
RUN=$(date +%s)
A_ID=$(mkuser "owner-$RUN@throwaway.invalid")
S_ID=$(mkuser "other-$RUN@throwaway.invalid")
A=$(token users "owner-$RUN@throwaway.invalid" "$PASS")
S=$(token users "other-$RUN@throwaway.invalid" "$PASS")
ok "two accounts signed in"

r=$(req PATCH "/api/collections/users/records/$A_ID" "$A" '{"name":"changed"}')
refused "$r" "an account changed itself"
r=$(req DELETE "/api/collections/users/records/$A_ID" "$A")
refused "$r" "an account removed itself"
ok "an account can't change or remove itself"

NOW=2026-01-02T10:00:00.000Z
LATER=2026-01-02T11:00:00.000Z
item() { # item OWNER_ID TITLE SLUG [UPDATED_AT]
  echo "{\"owner\":\"$1\",\"title\":\"$2\",\"note\":\"\",\"status\":\"open\",\"slug\":\"$3\",\"oldSlugs\":[],\"createdAt\":\"$NOW\",\"updatedAt\":\"${4:-$NOW}\",\"deletedAt\":\"\"}"
}
uuid() { printf '%08x-0000-4000-8000-%012x' "$RUN" "$1"; }

# --- Only a signed-in account, and only its own records (D-0006). ---
P=$(uuid 1)
r=$(req POST /api/collections/items/records "$A" "$(item "$A_ID" "Tea" tea | jq -c --arg id "$P" '. + {id: $id}')")
expect "$r" 200 "the owner makes an item under the device's own id"
[ "$(body "$r" | jq -r .id)" = "$P" ] || fail "the item didn't keep its id"
refused "$(req POST /api/collections/items/records "$A" "$(item "$S_ID" "Planted" planted)")" "an account made an item owned by another"
refused "$(req POST /api/collections/items/records "" "$(item "$A_ID" "Walk-in" walk-in)")" "a visitor made an item"
refused "$(req POST /api/collections/items/records "$A" "$(item "$A_ID" "Bad status" bad-status | sed 's/"open"/"someday"/')")" "a status the app doesn't have was saved"

for who in "" "$S"; do
  name=${who:+another account}
  name=${name:-a visitor}
  r=$(req GET /api/collections/items/records "$who")
  expect "$r" 200 "$name lists items"
  [ "$(body "$r" | jq '.items | length')" = 0 ] || fail "$name sees the owner's item"
  expect "$(req GET "/api/collections/items/records/$P" "$who")" 404 "$name reads the owner's item"
  refused "$(req PATCH "/api/collections/items/records/$P" "$who" "{\"title\":\"Taken\",\"updatedAt\":\"$LATER\"}")" "$name changed the owner's item"
  refused "$(req DELETE "/api/collections/items/records/$P" "$who")" "$name removed the owner's item"
done
r=$(req GET /api/collections/items/records "$A")
[ "$(body "$r" | jq '.items | length')" = 1 ] || fail "the owner doesn't see their item"
[ "$(body "$(req GET "/api/collections/items/records/$P" "$A")" | jq -r .title)" = Tea ] || fail "the owner's item was changed"
refused "$(req PATCH "/api/collections/items/records/$P" "$A" "{\"owner\":\"$S_ID\"}")" "the owner gave the item away"
refused "$(req DELETE "/api/collections/items/records/$P" "$A")" "the owner removed the item for good"
ok "a visitor and another account read and write nothing of the owner's; nothing changes hands or is removed"

# --- The newest change wins (D-0007). ---
r=$(req PATCH "/api/collections/items/records/$P" "$A" "{\"title\":\"Green tea\",\"updatedAt\":\"$LATER\"}")
expect "$r" 200 "a newer change"
[ "$(body "$r" | jq -r .title)" = "Green tea" ] || fail "a newer change wasn't saved"
r=$(req PATCH "/api/collections/items/records/$P" "$A" "{\"title\":\"Old tea\",\"updatedAt\":\"$NOW\"}")
expect "$r" 200 "an older change"
[ "$(body "$r" | jq -r '.title + " " + .updatedAt')" = "Green tea $LATER" ] || fail "the answer to an older change isn't the stored record: $(body "$r")"
[ "$(body "$(req GET "/api/collections/items/records/$P" "$A")" | jq -r .title)" = "Green tea" ] || fail "an older change overwrote a newer one"
# A delete is a tombstone, and syncs like any change.
r=$(req PATCH "/api/collections/items/records/$P" "$A" '{"deletedAt":"2026-01-02T12:00:00.000Z","updatedAt":"2026-01-02T12:00:00.000Z"}')
expect "$r" 200 "a tombstone"
r=$(req PATCH "/api/collections/items/records/$P" "$A" "{\"deletedAt\":\"\",\"title\":\"Back\",\"updatedAt\":\"$LATER\"}")
[ "$(body "$r" | jq -r .deletedAt)" = 2026-01-02T12:00:00.000Z ] || fail "an older change brought a deleted item back"
ok "an older change doesn't overwrite a newer one, and its answer is the stored record"

# --- Slugs two devices picked are settled here (D-0005). ---
mk() { # mk JSON: makes an item as the owner, prints "slug oldSlugs"
  local r
  r=$(req POST /api/collections/items/records "$A" "$1")
  expect "$r" 200 "make an item"
  body "$r" | jq -r '.id + " " + .slug + " " + (.oldSlugs | tojson)'
}
read -r K1 S1 _ <<<"$(mk "$(item "$A_ID" "Shopping list" shopping-list)")"
read -r _ S2 _ <<<"$(mk "$(item "$A_ID" "Shopping list" shopping-list)")"
read -r _ S3 _ <<<"$(mk "$(item "$A_ID" "Shopping list" shopping-list-2)")"
[ "$S1 $S2 $S3" = "shopping-list shopping-list-2 shopping-list-3" ] || fail "three items that wanted one slug got: $S1 $S2 $S3"
read -r _ S4 _ <<<"$(mk "$(item "$A_ID" "Green tea" tea)")"
[ "$S4" = tea-2 ] || fail "a deleted item's slug was given away: $S4"
r=$(req POST /api/collections/items/records "$S" "$(item "$S_ID" "Shopping list" shopping-list)")
[ "$(body "$r" | jq -r .slug)" = shopping-list ] || fail "slugs are per owner: $(body "$r")"
# A rename keeps the old slug as an earlier one, and it is never given to another item.
r=$(req PATCH "/api/collections/items/records/$K1" "$A" "{\"title\":\"Groceries\",\"slug\":\"groceries\",\"updatedAt\":\"$LATER\"}")
[ "$(body "$r" | jq -r '.slug + " " + (.oldSlugs | tojson)')" = 'groceries ["shopping-list"]' ] || fail "after a rename: $(body "$r")"
read -r _ S5 _ <<<"$(mk "$(item "$A_ID" "Shopping list" shopping-list)")"
[ "$S5" = shopping-list-4 ] || fail "an earlier slug was given to a new item: $S5"
ok "two items given the same slug end up with different ones; earlier slugs stay taken"

# --- CORS answers the app's origin only. ---
curl -sS -i -H "Origin: $APP" "$B/api/health" | grep -i "^access-control-allow-origin: $APP" >/dev/null ||
  fail "no CORS header for $APP"
if curl -sS -i -H 'Origin: https://another.example' "$B/api/health" | grep -i '^access-control-allow-origin' >/dev/null; then
  fail "a CORS header for another origin"
fi
ok "CORS answers $APP only"

echo "All smoke tests passed."

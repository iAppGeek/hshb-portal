#!/usr/bin/env bash
# Fetches the cleaned contact list from Supabase and saves it as JSON for
# sync-contacts.ps1. Prints counts only - never names or email addresses.
#
# Usage: ./fetch-contacts.sh [output-file]   (default: data/contacts.json)
set -euo pipefail
umask 077 # the output contains personal data: owner-only permissions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$SCRIPT_DIR/data/contacts.json}"

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env"
  set +a
fi
WORKDIR="${SUPABASE_WORKDIR:-$SCRIPT_DIR/../..}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v supabase > /dev/null || fail "Supabase CLI not found. Install it, then run 'supabase login' and 'supabase link'."
command -v jq > /dev/null || fail "jq not found. Install it with 'brew install jq'."

mkdir -p "$(dirname "$OUT")"
RAW="$(mktemp)"
TMP="$(mktemp)"
trap 'rm -f "$RAW" "$TMP"' EXIT

echo "Reading people from Supabase..."
# --agent no gives a plain JSON array; supabase's own progress goes to stderr.
supabase db query --linked --agent no --output json \
  --workdir "$WORKDIR" --file "$SCRIPT_DIR/contacts.sql" > "$RAW" ||
  fail "Supabase query failed."

jq '.[0].data | if type == "string" then fromjson else . end' "$RAW" > "$TMP" ||
  fail "Unexpected output from Supabase (not the expected JSON)."

jq -e '.version == 1 and (.contacts | type == "array") and (.accounts | type == "array")' "$TMP" > /dev/null ||
  fail "Output is missing version/contacts/accounts."

EMPTY_ROLES="$(jq -r '[.roles[] | select(.rows == 0) | .tag] | join(", ")' "$TMP")"
[ -z "$EMPTY_ROLES" ] || fail "Source returned 0 rows for: $EMPTY_ROLES. Not saving; nothing will be synced."
[ "$(jq '.contacts | length' "$TMP")" -gt 0 ] || fail "No valid contacts. Not saving; nothing will be synced."

mv "$TMP" "$OUT"
chmod 600 "$OUT"

echo
echo "--- Summary (counts only) ---"
jq -r '
  (.roles[] | "Source rows (\(.tag)): \(.rows)"),
  "Unique contacts: \(.contacts | length) (rows merged by email: \(.mergedRows))",
  ([.contacts[].tags[]] | group_by(.)[] | "  with role \(.[0]): \(length)"),
  "  with more than one role: \([.contacts[] | select((.tags | length) > 1)] | length)",
  "User accounts to tag: \(.accounts | length)",
  (.skipped[] | "Skipped (\(.role), \(.reason)): \(.count)")
' "$OUT"
echo
echo "Saved to $OUT (contains personal data; gitignored, owner-only)."
echo "Next: pwsh ./sync-contacts.ps1   (dry run)"

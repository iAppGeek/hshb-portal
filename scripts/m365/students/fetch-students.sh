#!/usr/bin/env bash
# Fetches the student list from Supabase and saves it as JSON for
# sync-students.ps1 and setup-teams.ps1. Prints counts only - never names or
# student codes.
#
# Usage: ./fetch-students.sh [output-file]   (default: data/students.json)
set -euo pipefail
umask 077 # the output contains personal data: owner-only permissions

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$SCRIPT_DIR/data/students.json}"

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/.env"
  set +a
fi
WORKDIR="${SUPABASE_WORKDIR:-$SCRIPT_DIR/../../..}"

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

echo "Reading students from Supabase..."
# --agent no gives a plain JSON array; supabase's own progress goes to stderr.
supabase db query --linked --agent no --output json \
  --workdir "$WORKDIR" --file "$SCRIPT_DIR/students.sql" > "$RAW" ||
  fail "Supabase query failed."

jq '.[0].data | if type == "string" then fromjson else . end' "$RAW" > "$TMP" ||
  fail "Unexpected output from Supabase (not the expected JSON)."

jq -e '.version == 1 and (.students | type == "array") and (.classes | type == "array")' "$TMP" > /dev/null ||
  fail "Output is missing version/students/classes."

YEARS="$(jq '.currentYearCount' "$TMP")"
[ "$YEARS" -eq 1 ] || fail "Expected exactly one current academic year, found $YEARS. Fix academic_years.is_current in the portal. Not saving."
[ "$(jq '.students | length' "$TMP")" -gt 0 ] || fail "No active students. Not saving; nothing will be synced."

mv "$TMP" "$OUT"
chmod 600 "$OUT"

echo
echo "--- Summary (counts only) ---"
jq -r '
  (.classes | map({key: .id, value: .yearGroup}) | from_entries) as $yearOf
  | "Academic year: \(.academicYear.code)",
  "Active classes: \(.classes | length) (with a teacher: \([.classes[] | select(.teacherEmail)] | length))",
  "Active students: \(.students | length)",
  "  without a student code: \([.students[] | select(.code == null)] | length)",
  "  without a current class: \([.students[] | select((.classIds | length) == 0)] | length)",
  "  in more than one class: \([.students[] | select((.classIds | length) > 1)] | length)",
  "Students per class year group (a student in two classes counts twice):",
  ([.students[].classIds[] | $yearOf[.]] | group_by(.)[] | "  \(.[0]): \(length)"),
  "Inactive students with a code: \(.inactiveCodes | length)",
  (.skipped[] | "Skipped (\(.reason)): \(.count)")
' "$OUT"
echo
echo "Saved to $OUT (contains personal data; gitignored, owner-only)."
echo "Which year groups need an account is set in config.psd1; the dry run shows the counts."
echo "Next: pwsh ./sync-students.ps1   (dry run)"

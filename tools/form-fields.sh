#!/usr/bin/env bash
# Pull the entry IDs out of a Google Form so they don't have to be found by hand.
#
#   tools/form-fields.sh 'https://docs.google.com/forms/d/e/FORM_ID/viewform'
#
# Prints the action URL and every field's entry ID with its question title,
# in form order, ready to paste into the CONFIG block of js/collect.js.
set -euo pipefail

URL="${1:-}"
[ -z "$URL" ] && { echo "usage: $0 <google form viewform URL>" >&2; exit 1; }

HTML=$(curl -sSL "$URL")

FORM_ID=$(printf '%s' "$URL" | grep -oE '/forms/d/e/[A-Za-z0-9_-]+' | head -1 | sed 's|/forms/d/e/||')
[ -z "$FORM_ID" ] && { echo "Could not find a form id in that URL." >&2; exit 1; }

echo "action: https://docs.google.com/forms/d/e/${FORM_ID}/formResponse"
echo

# Google embeds the field definitions in FB_PUBLIC_LOAD_DATA_; each entry is
# [id, "Question title", ...] with the entry id appearing as a bare number.
printf '%s' "$HTML" \
  | grep -oE '\[[0-9]{6,},"[^"]*"' \
  | sed -E 's/^\[([0-9]+),"(.*)"$/entry.\1  \2/' \
  | awk '!seen[$0]++'

#!/bin/bash
#
# Inserts the header placeholder snippet (.pipeline/header-snippet.html) right
# after the <body> tag of every page in the repo root that does not already
# contain id="header-placeholder". Works no matter which directory it is
# invoked from: everything is resolved relative to this script's own location.
#
#   bash .pipeline/check-and-inject.sh    # from the repo root
#   bash check-and-inject.sh              # from inside .pipeline/
#
# Pages that already have the placeholder are not touched at all.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SNIPPET="$SCRIPT_DIR/header-snippet.html"

if [[ ! -f "$SNIPPET" ]]; then
  echo "Error: $SNIPPET not found!" >&2
  exit 1
fi

# Snippet content without trailing newlines
snippet="$(<"$SNIPPET")"

body_re='<body[^>]*>'

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

for path in "$REPO_ROOT"/*.html; do
  [[ -f "$path" ]] || continue
  file="$(basename "$path")"

  # header.html is the generated header itself, never a page
  if [[ "$file" == "header.html" ]]; then
    continue
  fi

  if grep -q 'id="header-placeholder"' "$file"; then
    echo "$file already has header-placeholder, skipping."
    continue
  fi

  # Read the whole file, preserving any trailing newlines (or lack of them)
  content="$(cat "$file"; printf x)"
  content="${content%x}"

  if [[ ! "$content" =~ $body_re ]]; then
    echo "Warning: no <body> tag found in $file, skipping." >&2
    continue
  fi

  body_tag="${BASH_REMATCH[0]}"
  before="${content%%"$body_tag"*}"
  after="${content#*"$body_tag"}"

  echo "Injecting into $file..."

  {
    printf '%s%s\n%s' "$before" "$body_tag" "$snippet"
    # Keep whatever followed <body> on its own line
    if [[ -n "$after" && "$after" != $'\n'* ]]; then
      printf '\n'
    fi
    printf '%s' "$after"
  } > "$tmp"
  # Copy back into the existing file so its permissions are preserved
  cp "$tmp" "$file"
done

echo "Injection complete."

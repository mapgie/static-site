#!/bin/bash
#
# Generates header.html in the repo root from the list of pages in the repo
# root. Works no matter which directory it is invoked from: everything is
# resolved relative to this script's own location (.pipeline/).
#
#   bash .pipeline/build-header.sh        # from the repo root
#   bash build-header.sh                  # from inside .pipeline/
#
# Nav order: Home (index.html), Ant Farm (ant-farm.html), then every other
# root page alphabetically. A checksum of the page list is kept in
# .pipeline/.header_checksum so the header is only rebuilt when pages are
# added or removed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

HEADER_FILE="header.html"
CHECKSUM_FILE="$SCRIPT_DIR/.header_checksum"
REPO_URL="https://github.com/mapgie/static-site/"

TMP_HEADER_FILE="$(mktemp)"
trap 'rm -f "$TMP_HEADER_FILE"' EXIT

# Helper to capitalize each dash-separated word: "memory-maze" -> "Memory Maze"
capitalize() {
  awk '
  BEGIN {
    n = split(ARGV[1], words, /-/)
    ARGV[1] = ""
    for (i = 1; i <= n; i++) {
      word = words[i]
      printf "%s%s", toupper(substr(word, 1, 1)), tolower(substr(word, 2))
      if (i < n) printf " "
    }
  }' "$1"
}

# Collect page names (basenames, so the checksum is machine-independent) from
# the repo root only. header.html is the output, and ant-*.html pages other
# than ant-farm.html are helper pages that do not get a nav link.
page_names=()
for path in "$REPO_ROOT"/*.html; do
  [[ -f "$path" ]] || continue
  name="$(basename "$path")"
  case "$name" in
    header.html) continue ;;
    ant-farm.html) ;;
    ant-*.html) continue ;;
  esac
  page_names+=("$name")
done

if [[ ${#page_names[@]} -gt 0 ]]; then
  mapfile -t page_names < <(printf '%s\n' "${page_names[@]}" | LC_ALL=C sort)
fi

# Split into Home, Ant Farm and the rest (already alphabetical)
home_page=""
ant_farm_page=""
other_pages=()
for name in "${page_names[@]}"; do
  case "$name" in
    index.html)    home_page="$name" ;;
    ant-farm.html) ant_farm_page="$name" ;;
    *)             other_pages+=("$name") ;;
  esac
done

# Checksum of the page list; skip regeneration when it has not changed
current_checksum="$( { printf '%s\0' "${page_names[@]+"${page_names[@]}"}"; } | sha256sum | awk '{print $1}')"

if [[ -f "$CHECKSUM_FILE" ]] && [[ "$(tr -d '[:space:]' < "$CHECKSUM_FILE")" == "$current_checksum" ]]; then
  echo "No changes made."
  exit 0
fi

# Build the header. No <script> here: header.html is injected with innerHTML,
# so scripts in it would never run; the menu is wired by header.js instead.
{
  echo '<div id="site-header">'
  echo "  <a href='$REPO_URL' target='_blank' class='site-icon'>👾</a>"
  echo '  <div id="hamburger">☰</div>'
  echo '  <div id="nav-links">'
  if [[ -n "$home_page" ]]; then
    echo '    <a href="index.html">Home</a>'
  fi
  if [[ -n "$ant_farm_page" ]]; then
    echo '    <a href="ant-farm.html">Ant Farm</a>'
  fi
  for name in "${other_pages[@]+"${other_pages[@]}"}"; do
    base="${name%.html}"
    echo "    <a href='${base}.html'>$(capitalize "$base")</a>"
  done
  echo ''
  echo '  </div>'
  echo '</div>'
  echo ''
} > "$TMP_HEADER_FILE"

# Only touch header.html if the content actually changed
if [[ -f "$HEADER_FILE" ]] && cmp -s "$TMP_HEADER_FILE" "$HEADER_FILE"; then
  echo "No changes made."
else
  cp "$TMP_HEADER_FILE" "$HEADER_FILE"
  echo "Header regenerated successfully."
fi

echo "$current_checksum" > "$CHECKSUM_FILE"

#!/bin/bash

set -euo pipefail

# Output file
HEADER_FILE="header.html"
TMP_HEADER_FILE="$(mktemp)"
CHECKSUM_FILE=".header_checksum"

# Helper to capitalize each word properly
capitalize() {
  awk '
  BEGIN {
    split(ARGV[1], words, /-/)
    ARGV[1] = ""
    for (i = 1; i <= length(words); i++) {
      word = words[i]
      printf toupper(substr(word,1,1)) tolower(substr(word,2))
      if (i < length(words)) printf " "
    }
  }' "$1"
}

# Find matching files
mapfile -d '' files < <(
  find . -maxdepth 1 -type f -name "*.html" \
    ! -name "header.html" \
    ! -name "ant-*.html" ! -name "ant-farm.html" \
    -print0 | sort -z
)

# Compute checksum of file list
current_checksum="$(printf '%s\0' "${files[@]}" | sha256sum | awk '{print $1}')"

# If checksum matches previous run, skip regeneration
if [[ -f "$CHECKSUM_FILE" ]] && grep -q "$current_checksum" "$CHECKSUM_FILE"; then
  echo "No changes made."
  exit 0
fi

# Start building header
{
  echo '<div id="site-header">'
  echo '  <a href="https://github.com/mapgie/static-site/" target="_blank" class="site-icon">👾</a>'
  echo '  <div id="hamburger">☰</div>'
  echo '  <div id="nav-links">'
} > "$TMP_HEADER_FILE"

# Build nav links
for file in "${files[@]}"; do
  base="$(basename "$file" .html)"

  if [[ "$base" == "index" ]]; then
    display_name="Home"
  elif [[ "$base" == "ant-farm" ]]; then
    display_name="Ant Farm"
  else
    display_name=$(capitalize "$base")
  fi

  echo "    <a href=\"${base}.html\">$display_name</a>" >> "$TMP_HEADER_FILE"
done

# Finish header
{
  echo '  </div>'
  echo '</div>'
  echo ''
  echo '<script>'
  echo '  const hamburger = document.getElementById("hamburger");'
  echo '  const navLinks = document.getElementById("nav-links");'
  echo '  hamburger.addEventListener("click", () => {'
  echo '    navLinks.classList.toggle("show");'
  echo '  });'
  echo '</script>'
} >> "$TMP_HEADER_FILE"

# Compare and move if different
if [[ -f "$HEADER_FILE" ]] && cmp -s "$TMP_HEADER_FILE" "$HEADER_FILE"; then
  echo "No changes made."
else
  mv "$TMP_HEADER_FILE" "$HEADER_FILE"
  echo "$current_checksum" > "$CHECKSUM_FILE"
  echo "Header regenerated successfully."
fi

# Clean up
[[ -f "$TMP_HEADER_FILE" ]] && rm -f "$TMP_HEADER_FILE"
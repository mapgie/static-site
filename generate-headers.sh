#!/bin/bash

set -euo pipefail

# Output file
HEADER_FILE="header.html"

# Temp file to compare
TMP_HEADER_FILE="$(mktemp)"

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

# Begin building header in memory
output='<div id="site-header" style="padding: 1rem; background: #111; color: #eee; text-align: center; font-family: Inter, sans-serif;">'

# Prepare array safely
mapfile -d '' files < <(
  find . -maxdepth 1 -type f -name "*.html" \
    ! -name "header.html" \
    ! \( -name "ant-*.html" ! -name "ant-farm.html" \) \
    -print0 | sort -z
)

# Loop and build the links
for file in "${files[@]}"; do
  base="$(basename "$file" .html)"

  if [[ "$base" == "index" ]]; then
    display_name="Home"
  else
    display_name=$(capitalize "$base")
  fi

  output+=" <a href=\"${base}.html\" style=\"margin: 0 1rem; color: #eee; text-decoration: none;\">$display_name</a> |"
done

# Remove the final trailing " |"
output="${output% |}"

# Close div
output+="</div>"

# Write the output to a temp file first
echo "$output" > "$TMP_HEADER_FILE"

# Compare with existing HEADER_FILE if it exists
if [[ -f "$HEADER_FILE" ]] && cmp -s "$TMP_HEADER_FILE" "$HEADER_FILE"; then
  echo "No changes made."
else
  mv "$TMP_HEADER_FILE" "$HEADER_FILE"
  echo "Header regenerated successfully."
fi

# Clean up temp file if still around
[[ -f "$TMP_HEADER_FILE" ]] && rm -f "$TMP_HEADER_FILE"

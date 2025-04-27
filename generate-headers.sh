#!/bin/bash

set -euo pipefail

# Output file
HEADER_FILE="header.html"

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
mapfile -d '' files < <(find . -maxdepth 1 -name "*.html" ! -name "header.html" -print0 | sort -z)

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

# Remove the final trailing " |" properly without touching files
output="${output% |}"

# Close div
output+="</div>"

# Write everything at once
echo "$output" > "$HEADER_FILE"

echo "Header regenerated successfully."

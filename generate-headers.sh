#!/bin/bash

set -euo pipefail

# Output file
HEADER_FILE="header.html"

# Helper to capitalize words properly
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

# Begin building header
output='
<div id="site-header">
  <a href="https://github.com/mapgie/static-site/" target="_blank" class="site-icon">👾</a>
  <div id="nav-links">
'

# Find all .html files excluding header.html itself
mapfile -d '' files < <(
  find . -maxdepth 1 -type f -name "*.html" \
    ! -name "header.html" \
    ! \( -name "ant-*.html" ! -name "ant-farm.html" \) \
    -print0 | sort -z
)

# Loop over files and build the links
for file in "${files[@]}"; do
  base="$(basename "$file" .html)"

  if [[ "$base" == "index" ]]; then
    display_name="Home"
  else
    display_name=$(capitalize "$base")
  fi

  output+="    <a href=\"${base}.html\">$display_name</a>\n"
done

# Close the nav and add hamburger button
output+='
  </div>
  <div id="hamburger">☰</div>
</div>

<script>
  const hamburger = document.getElementById("hamburger");
  const navLinks = document.getElementById("nav-links");

  hamburger.addEventListener("click", () => {
    navLinks.classList.toggle("show");
  });
</script>
'

# Write to file
echo -e "$output" > "$HEADER_FILE"

echo "✅ Header regenerated successfully."

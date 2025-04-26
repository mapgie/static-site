#!/bin/bash

# Output file
HEADER_FILE="header.html"

# Helper: capitalize first letter of each word
capitalize() {
  local input="$1"
  local output=""
  for word in ${input//-/ }; do
    first_letter=${word:0:1}
    rest=${word:1}
    output+="${first_letter^^}${rest} "
  done
  echo "${output% }"
}

# Start header content
{
  echo '<div id="site-header" style="padding: 1rem; background: #111; color: #eee; text-align: center; font-family: Inter, sans-serif;">'

  for file in $(ls *.html | sort); do
    if [ "$file" == "header.html" ]; then
      continue
    fi

    name="${file%.html}"

    if [ "$file" == "index.html" ]; then
      display_name="Home"
    else
      display_name=$(capitalize "$name")
    fi

    echo "  <a href=\"$file\" style=\"margin: 0 1rem; color: #eee; text-decoration: none;\">$display_name</a> |"
  done

  echo '</div>'
} > "$HEADER_FILE"

# Clean up last |
sed -i '$ s/ |<\/div>/<\/div>/' "$HEADER_FILE"

echo "Header regenerated successfully."
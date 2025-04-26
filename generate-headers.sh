#!/bin/bash

# Output file
HEADER_FILE="header.html"

# Start header content
echo '<div id="site-header" style="padding: 1rem; background: #111; color: #eee; text-align: center; font-family: Inter, sans-serif;">' > "$HEADER_FILE"

# Manually add Home link first
echo '  <a href="index.html" style="margin: 0 1rem; color: #eee; text-decoration: none;">Home</a> |' >> "$HEADER_FILE"

# Now loop through other .html files
for file in *.html; do
  # Skip index.html, header.html, and header-snippet.html
  if [[ "$file" == "index.html" || "$file" == "header.html" || "$file" == "header-snippet.html" ]]; then
    continue
  fi

  # Remove .html extension
  name="${file%.html}"

  # Capitalize first letters and replace hyphens with spaces
  display_name=$(echo "$name" | sed -r 's/(^|-)([a-z])/\U\\2/g' | sed 's/-/ /g')

  echo "  <a href=\"$file\" style=\"margin: 0 1rem; color: #eee; text-decoration: none;\">$display_name</a> |" >> "$HEADER_FILE"
done

# Remove trailing pipe and space from last line
sed -i '$ s/ |$//' "$HEADER_FILE"

# Close div
echo '</div>' >> "$HEADER_FILE"

echo "Header regenerated successfully."
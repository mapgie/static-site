#!/bin/bash

# Output file
HEADER_FILE="header.html"

# Start header content
echo '<div id="site-header" style="padding: 1rem; background: #111; color: #eee; text-align: center; font-family: Inter, sans-serif;">' > "$HEADER_FILE"

# Loop through .html files
for file in *.html; do
  # Skip header.html itself
  if [ "$file" == "header.html" ]; then
    continue
  fi

  # Remove .html extension
  name="${file%.html}"

  # Handle special case for index.html
  if [ "$file" == "index.html" ]; then
    display_name="Home"
  else
    # Capitalize first letters and replace hyphens with spaces
    display_name=$(echo "$name" | sed -r 's/(^|-)([a-z])/\U\\2/g' | sed 's/-/ /g')
  fi

  echo "  <a href=\"$file\" style=\"margin: 0 1rem; color: #eee; text-decoration: none;\">$display_name</a> |" >> "$HEADER_FILE"
done

# Remove trailing pipe and space from the last line
sed -i '$ s/ |$//' "$HEADER_FILE"

# Close div
echo '</div>' >> "$HEADER_FILE"

echo "Header regenerated successfully."

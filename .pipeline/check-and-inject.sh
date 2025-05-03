 
#!/bin/bash

# Path to snippet
SNIPPET="header-snippet.html"

# Check if snippet file exists
if [ ! -f "$SNIPPET" ]; then
  echo "Error: $SNIPPET not found!"
  exit 1
fi

# Loop through html files
for file in *.html; do
  # Skip header.html and header-snippet.html
  if [[ "$file" == "header.html" || "$file" == "header-snippet.html" ]]; then
    continue
  fi

  # Check if already has header-placeholder
  if grep -q 'id="header-placeholder"' "$file"; then
    echo "$file already has header-placeholder, skipping."
    continue
  fi

  echo "Injecting into $file..."

  # Insert after <body> tag
  awk '
    /<body[^>]*>/ {
      print
      while ((getline line < "'"$SNIPPET"'") > 0) print line
      next
    }
    { print }
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"

done

echo "Injection complete."
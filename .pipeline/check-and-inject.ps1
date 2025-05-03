# Path to snippet
Get-Location
$snippet = "header-snippet.html"

# Check if snippet file 
if (-not (Test-Path $snippet)) {
    Write-Error "$snippet not found!"
    exit 1
}

$snippetContent = Get-Content $snippet

# Loop through HTML files
$RepoRoot = (Get-Location).ProviderPath  
$RepoRoot = Split-Path -Path $RepoRoot -Parent  
  
Push-Location $RepoRoot  
Get-ChildItem *.html | ForEach-Object {
    $file = $_.Name

    # Skip header.html and header-snippet.html
    if ($file -eq "header.html" -or $file -eq "header-snippet.html") {
        return
    }

    # Check if already has header-placeholder
    if (Select-String -Pattern 'id="header-placeholder"' -Path $file) {
        Write-Host "$file already has header-placeholder, skipping."
        return
    }

    Write-Host "Injecting into $file..."

    # Read original lines
    $lines = Get-Content $file

    # Prepare output
    $output = @()

    foreach ($line in $lines) {
        $output += $line
        if ($line -match "<body[^>]*>") {
            $output += $snippetContent
        }
    }

    # Overwrite file
    $output | Set-Content $file -Encoding UTF8
}

Pop-Location
Write-Host "Injection complete."
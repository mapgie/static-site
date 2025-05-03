function build-header {  
Set-StrictMode -Version Latest  
$ErrorActionPreference = 'Stop'  
  
$RepoRoot = (Get-Location).ProviderPath  
$RepoRoot = Split-Path -Path $RepoRoot -Parent  
  
# File paths  
$HeaderFile   = Join-Path $RepoRoot 'header.html'  
$ChecksumFile = Join-Path $RepoRoot '.header_checksum'  
$TempFile     = [IO.Path]::GetTempFileName()  
$RepoUrl      = 'https://github.com/mapgie/static-site/'  
  
function Get-PageFiles {  
    <# Retrieves all .html files excluding any whose BaseName starts with 'header' or 'ant*' (allowing 'ant-farm') #>  
    Get-ChildItem -Path $RepoRoot -File -Filter '*.html' |  
      Where-Object {  
        ($_.BaseName -notlike 'header*') -and   
        ( ($_.BaseName -notlike 'ant*') )  
      } |  
      Sort-Object Name  
}  
function Compute-Checksum {  
    <# Computes SHA-256 over the list of file paths #>  
    param(  
      [IO.FileInfo[]] $Files  
    )  
    $concatenated = ($Files | ForEach-Object { $_.FullName + "`0" }) -join ''  
    $bytes        = [Text.Encoding]::UTF8.GetBytes($concatenated)  
    $hash         = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)  
    return ($hash | ForEach-Object { $_.ToString('x2') }) -join ''  
}  
  
function Capitalize-Label {  
    <# Capitalizes each dash-separated word in a string #>  
    param(  
      [string] $Name  
    )  
    $parts = $Name -split '-'  
    $capitalized = $parts | ForEach-Object {  
        if ($_ -ne '') {  
            $_.Substring(0,1).ToUpper() + $_.Substring(1).ToLower()  
        }  
    }  
    return $capitalized -join ' '  
}  
  
function Build-HeaderFile {  
    param(  
      [IO.FileInfo[]] $OtherPages,  
      [string]        $OutputPath  
    )  
    $lines = @(  
      '<div id="site-header">',  
      "  <a href='$RepoUrl' target='_blank' class='site-icon'>👾</a>",  
      '  <div id="hamburger">☰</div>',  
      '  <div id="nav-links">'  
    )  
  
    $lines += '    <a href="index.html">Home</a>'  
    $lines += '    <a href="ant-farm.html">Ant Farm</a>'  
  
    foreach ($page in $OtherPages) {  
      $basename = $page.BaseName  
      $label    = Capitalize-Label -Name $basename  
      $lines   += "    <a href='$basename.html'>$label</a>"  
    }  
  
    $lines += @(   
      '',  
      '  </div>',  
      '</div>',  
      '',  
      '<script>',  
      '  const hamburger = document.getElementById("hamburger");',  
      '  const navLinks  = document.getElementById("nav-links");',  
      '  hamburger.addEventListener("click", () => {',  
      '    navLinks.classList.toggle("show");',  
      '  });',  
      '</script>'  
    )  
  
    foreach ($line in $lines) {  
      Write-Host $line -ForegroundColor Green   
    }  
    
  
    $lines | Out-File -FilePath $OutputPath -Encoding UTF8  
}  
  
# MAIN  
$pages       = Get-PageFiles  
$OtherPages  = $pages | Where-Object BaseName -notin 'index','ant-'  
  
$currentHash = Compute-Checksum -Files $pages  
  
if (Test-Path $ChecksumFile) {  
  $previousHash = Get-Content $ChecksumFile -Raw  
  if ($previousHash -eq $currentHash) {  
    Write-Host 'No changes made.'  
    exit 0  
  }  
}  
  
# Rebuild header if needed  
Build-HeaderFile -OtherPages $OtherPages -OutputPath $TempFile  
  
if (Test-Path $HeaderFile) {  
  $diff = Compare-Object (Get-Content $HeaderFile) (Get-Content $TempFile)  
  if (-not $diff) {  
    Remove-Item $TempFile -Force  
    Write-Host 'No changes made.'  
    exit 0  
  }  
}  
  
  
Write-Host   
Move-Item -Path $TempFile -Destination $HeaderFile -Force  
Set-Content -Path $ChecksumFile -Value $currentHash -Encoding UTF8  
Write-Host 'Header regenerated successfully.'  
  
}  
  
build-header 
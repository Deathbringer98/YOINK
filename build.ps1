# build.ps1 — create browser-specific zip packages for Yoink
# Usage:  .\build.ps1            (builds both)
#         .\build.ps1 -Firefox   (Firefox only)
#         .\build.ps1 -Chrome    (Chrome/Brave only)
param(
  [switch]$Firefox,
  [switch]$Chrome
)

$all = -not $Firefox -and -not $Chrome

$CORE_FILES = @(
  "background.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.js",
  "html2canvas.min.js",
  "128x128.png",
  "yoink.mp3",
  "LICENSE"
)

function Build-Package($label, $manifestSrc, $outZip) {
  Write-Host "`nBuilding $label..." -ForegroundColor Cyan

  $tmp = ".\build-tmp-$label"
  if (Test-Path $tmp)   { Remove-Item $tmp -Recurse -Force }
  if (Test-Path $outZip){ Remove-Item $outZip -Force }

  New-Item -ItemType Directory -Path $tmp | Out-Null

  foreach ($f in $CORE_FILES) {
    if (Test-Path $f) { Copy-Item $f "$tmp\" }
    else { Write-Warning "  Skipping missing file: $f" }
  }

  Copy-Item $manifestSrc "$tmp\manifest.json"
  Compress-Archive -Path "$tmp\*" -DestinationPath $outZip -Force
  Remove-Item $tmp -Recurse -Force

  $size = [math]::Round((Get-Item $outZip).Length / 1KB, 1)
  Write-Host "  -> $outZip ($size KB)" -ForegroundColor Green
}

if ($all -or $Chrome)  { Build-Package "chrome"  "manifest.json"         "yoink-chrome.zip" }
if ($all -or $Firefox) { Build-Package "firefox" "manifest.firefox.json" "yoink-firefox.zip" }

Write-Host "`nDone." -ForegroundColor Cyan

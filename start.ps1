param([switch]$Demo)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
if ($Demo) { npm run seed }
Write-Host 'Open http://localhost:3000 . Stop with Ctrl+C.'
npm start

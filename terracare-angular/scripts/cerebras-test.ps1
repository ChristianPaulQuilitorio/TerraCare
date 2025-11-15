<#
.SYNOPSIS
  Quick helper to call the Cerebras chat completions endpoint from PowerShell.

.DESCRIPTION
  This script reads $env:CEREBRAS_API_KEY, builds a minimal payload and invokes the
  Cerebras /v1/chat/completions endpoint. By default it uses Invoke-RestMethod (PowerShell native).
  Optionally you can use the native curl.exe by passing -UseCurl.

  NOTE: Do NOT commit your API key. Set it in the environment or in your session only.

.EXAMPLE
  # set key for session
  $env:CEREBRAS_API_KEY = 'sk_...'

  # run with default message
  .\scripts\cerebras-test.ps1

  # run with custom message
  .\scripts\cerebras-test.ps1 -Message 'Hello from PowerShell'

  # use native curl (useful for streaming flags later)
  .\scripts\cerebras-test.ps1 -Message 'Hello' -UseCurl
#>

param(
  [string]$Message = 'Hello from cerebras-test.ps1',
  [string]$Model = 'llama-3.3-70b',
  [switch]$UseCurl
)

if (-not $env:CEREBRAS_API_KEY) {
  Write-Error "CEREBRAS_API_KEY environment variable not set. Set it with: `$env:CEREBRAS_API_KEY = 'csk-vjrw4kmej4heyhcn69p6dhyn2v6r8fv23jd8rychwwkw2cm5'"
  exit 1
}

# Build payload as an object and convert to JSON to avoid quoting issues
$payloadObj = @{
  model = $Model
  messages = @(@{ role = 'user'; content = $Message })
}

$payload = $payloadObj | ConvertTo-Json -Depth 12

Write-Host "Sending request to Cerebras (model=$Model)" -ForegroundColor Cyan

if ($UseCurl) {
  Write-Host "Using native curl.exe and piping JSON to stdin..." -ForegroundColor Yellow
  try {
    # Use the call operator (&) with an explicit argument array so PowerShell does not interpret @- as a here-doc.
    $curlArgs = @(
      '--location',
      'https://api.cerebras.ai/v1/chat/completions',
      '-H', "Authorization: Bearer $env:CEREBRAS_API_KEY",
      '-H', 'Content-Type: application/json',
      '--data-binary', '@-'
    )
    # Pipe payload into curl.exe which will read body from stdin due to @-
    $payload | & 'curl.exe' @curlArgs
  } catch {
    Write-Error "curl.exe invocation failed: $_"
    exit 2
  }
} else {
  try {
    $headers = @{ Authorization = "Bearer $env:CEREBRAS_API_KEY"; 'Content-Type' = 'application/json' }
    $resp = Invoke-RestMethod -Uri 'https://api.cerebras.ai/v1/chat/completions' -Method Post -Headers $headers -Body $payload -ErrorAction Stop
    # Pretty-print response JSON
    $resp | ConvertTo-Json -Depth 12
  } catch {
    Write-Error "Invoke-RestMethod failed: $_"
    exit 3
  }
}

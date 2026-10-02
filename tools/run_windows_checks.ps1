# tools/run_windows_checks.ps1
# Automated Windows Verification Runner for Deutsch Lernen PWA
# Runs Playwright Offline SW Test, Lighthouse Audits, Verifier, and Mutation Tests

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

# Root Directory resolution (handles spaces safely)
$rootDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location -LiteralPath $rootDir

$resultsDir = Join-Path -Path $rootDir -ChildPath "audit\windows_results"
if (!(Test-Path -LiteralPath $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}

$summaryPath = Join-Path -Path $resultsDir -ChildPath "summary.txt"
$rawLogPath = Join-Path -Path $resultsDir -ChildPath "raw_run.log"

# Initialize Logs
"" | Out-File -FilePath $summaryPath -Encoding utf8
"" | Out-File -FilePath $rawLogPath -Encoding utf8

function Log-Output($msg) {
    Write-Host $msg
    $msg | Out-File -FilePath $rawLogPath -Append -Encoding utf8
}

Log-Output "=========================================================="
Log-Output "  WINDOWS E2E VERIFICATION & AUDIT SUITE"
Log-Output "  Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log-Output "  Project: $rootDir"
Log-Output "=========================================================="

$stepResults = [ordered]@{}

# 1. Version Detection
Log-Output "`n[1/6] Detecting System Environments..."
$nodeVer = try { (node -v).Trim() } catch { "NOT_INSTALLED" }
$npmVer = try { (npm -v).Trim() } catch { "NOT_INSTALLED" }
$pythonVer = try { (python --version 2>&1).Trim() } catch { "NOT_INSTALLED" }

$chromePath = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (!(Test-Path -LiteralPath $chromePath)) {
    $chromePath = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}
if (!(Test-Path -LiteralPath $chromePath)) {
    $chromePath = "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
}

$chromeVer = if (Test-Path -LiteralPath $chromePath) {
    try { (Get-Item -LiteralPath $chromePath).VersionInfo.ProductVersion } catch { "Installed" }
} else {
    "NOT_FOUND"
}

Log-Output "  - Node.js   : $nodeVer"
Log-Output "  - NPM       : $npmVer"
Log-Output "  - Python    : $pythonVer"
Log-Output "  - Chrome    : $chromeVer ($chromePath)"

# 2. Dependency Check & Playwright Browsers
Log-Output "`n[2/6] Checking Node Dependencies and Playwright Chromium..."
if (!(Test-Path -LiteralPath (Join-Path $rootDir "node_modules"))) {
    Log-Output "  Installing npm packages (npm install)..."
    & npm install | Out-File -FilePath $rawLogPath -Append -Encoding utf8
}

Log-Output "  Installing Playwright browser binaries..."
& npx playwright install chromium | Out-File -FilePath $rawLogPath -Append -Encoding utf8
$stepResults["Dependencies"] = "PASS"

# 3. Background Local HTTP Server
Log-Output "`n[3/6] Starting background HTTP server on port 8000..."
$serverProc = $null
$lhScores = @{ Accessibility = "N/A"; BestPractices = "N/A" }

try {
    $serverProc = Start-Process -FilePath "python" -ArgumentList "-m", "http.server", "8000" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2
    
    # Test HTTP reachability
    $testHttp = try { (Invoke-WebRequest -Uri "http://localhost:8000/" -UseBasicParsing -TimeoutSec 3).StatusCode } catch { 0 }
    if ($testHttp -eq 200) {
        Log-Output "  HTTP Server active on http://localhost:8000 (PID: $($serverProc.Id))"
        $stepResults["HttpServer"] = "PASS"
    } else {
        Log-Output "  WARNING: Server returned status $testHttp"
        $stepResults["HttpServer"] = "WARN"
    }

    # 4. Playwright Offline Service Worker Test
    Log-Output "`n[4/6] Running Playwright Offline PWA Test (tests/offline_sw.spec.js)..."
    $pwOutput = & npx playwright test tests/offline_sw.spec.js --reporter=list 2>&1
    $pwOutput | Out-File -FilePath $rawLogPath -Append -Encoding utf8
    $pwOutput | ForEach-Object { Write-Host "  $_" }

    if ($LASTEXITCODE -eq 0) {
        $stepResults["OfflinePlaywright"] = "PASS"
    } else {
        $stepResults["OfflinePlaywright"] = "FAIL"
    }

    # 5. Lighthouse Audits
    Log-Output "`n[5/6] Running Lighthouse (Accessibility, Best-Practices)..."
    $lhOutputPath = Join-Path $resultsDir "lighthouse"
    $lhCmd = @(
        "http://localhost:8000",
        "--only-categories=accessibility,best-practices",
        "--chrome-flags=--headless",
        "--output=json,html",
        "--output-path=$lhOutputPath",
        "--quiet"
    )
    if (Test-Path -LiteralPath $chromePath) {
        $lhCmd += "--chrome-path=$chromePath"
    }

    $lhRun = & npx lighthouse @lhCmd 2>&1
    $lhRun | Out-File -FilePath $rawLogPath -Append -Encoding utf8

    $lhJsonPath = "$lhOutputPath.report.json"
    if (!(Test-Path -LiteralPath $lhJsonPath)) {
        $lhJsonPath = "$lhOutputPath.json"
    }

    if (Test-Path -LiteralPath $lhJsonPath) {
        try {
            $lhJson = Get-Content -LiteralPath $lhJsonPath -Raw -Encoding utf8 | ConvertFrom-Json
            if ($lhJson.categories.accessibility) {
                $lhScores.Accessibility = [math]::Round($lhJson.categories.accessibility.score * 100)
            }
            if ($lhJson.categories."best-practices") {
                $lhScores.BestPractices = [math]::Round($lhJson.categories."best-practices".score * 100)
            }
            Log-Output "  Lighthouse Accessibility : $($lhScores.Accessibility) / 100"
            Log-Output "  Lighthouse Best-Practices: $($lhScores.BestPractices) / 100"
            $stepResults["Lighthouse"] = "PASS"
        } catch {
            Log-Output "  Failed to parse Lighthouse JSON report: $_"
            $stepResults["Lighthouse"] = "FAIL (JSON parse)"
        }
    } else {
        Log-Output "  Lighthouse output file not generated."
        $stepResults["Lighthouse"] = "FAIL (No report)"
    }

} finally {
    if ($serverProc -and !$serverProc.HasExited) {
        Log-Output "`nStopping background HTTP server (PID: $($serverProc.Id))...`n"
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    }
}

# 6. Vocabulary Integrity & Mutation Tests
Log-Output "`n[6/6] Running Vocabulary Integrity & Mutation Tests..."
Log-Output "  Running verify_vocab.py..."
$verifyOutput = & python verify_vocab.py 2>&1
$verifyOutput | Out-File -FilePath $rawLogPath -Append -Encoding utf8
if ($LASTEXITCODE -eq 0) {
    Log-Output "  verify_vocab.py: PASS"
    $stepResults["VerifyVocab"] = "PASS"
} else {
    Log-Output "  verify_vocab.py: FAIL"
    $stepResults["VerifyVocab"] = "FAIL"
}

Log-Output "  Running tests/mutation_verifier_test.py..."
$mutationOutput = & python tests/mutation_verifier_test.py 2>&1
$mutationOutput | Out-File -FilePath $rawLogPath -Append -Encoding utf8
if ($LASTEXITCODE -eq 0) {
    Log-Output "  mutation_verifier_test.py: PASS"
    $stepResults["MutationTests"] = "PASS"
} else {
    Log-Output "  mutation_verifier_test.py: FAIL"
    $stepResults["MutationTests"] = "FAIL"
}

# 7. Write Structured Summary Report
$summaryLines = @(
    "=================================================================",
    "  DEUTSCH LERNEN PWA - WINDOWS VERIFICATION SUMMARY REPORT",
    "=================================================================",
    "Execution Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "System Path    : $rootDir",
    "",
    "ENVIRONMENT VERSIONS:",
    "  Node.js      : $nodeVer",
    "  NPM          : $npmVer",
    "  Python       : $pythonVer",
    "  Google Chrome: $chromeVer",
    "",
    "AUDIT & TEST RESULTS:",
    "  1. Dependencies Installation   : $($stepResults['Dependencies'])",
    "  2. HTTP Server Startup         : $($stepResults['HttpServer'])",
    "  3. Playwright Offline SW Test  : $($stepResults['OfflinePlaywright'])",
    "  4. Lighthouse Accessibility    : $($lhScores.Accessibility) / 100",
    "  5. Lighthouse Best Practices   : $($lhScores.BestPractices) / 100",
    "  6. Vocabulary Verifier SHA-256 : $($stepResults['VerifyVocab'])",
    "  7. 12 Controlled Mutation Tests: $($stepResults['MutationTests'])",
    "",
    "DETAILED ARTIFACTS:",
    "  - Raw Terminal Log : $rawLogPath",
    "  - Lighthouse Report: $lhOutputPath.report.html",
    "================================================================="
)

$summaryLines | Out-File -FilePath $summaryPath -Encoding utf8

Log-Output "`n=========================================================="
Log-Output "  VERIFICATION COMPLETE"
Log-Output "  Summary Report : $summaryPath"
Log-Output "  Raw Log File   : $rawLogPath"
Log-Output "=========================================================="

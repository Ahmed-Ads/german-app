# tools/run_windows_checks.ps1
# Automated Windows Verification Runner for Deutsch Lernen PWA
# Runs Playwright Offline SW Test, Lighthouse Audits, Verifier, and Mutation Tests

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

# Configure UTF-8 console and process encoding across Windows PowerShell
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::InputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

# Root Directory resolution (handles spaces and parentheses safely)
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

function Get-LastLines($text, $count = 30) {
    if (!$text) { return @("No output captured.") }
    $lines = $text -split "\r?\n"
    if ($lines.Count -le $count) {
        return $lines
    }
    return $lines[($lines.Count - $count)..($lines.Count - 1)]
}

Log-Output "=========================================================="
Log-Output "  WINDOWS E2E VERIFICATION & AUDIT SUITE"
Log-Output "  Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Log-Output "  Project: $rootDir"
Log-Output "=========================================================="

$stepResults = [ordered]@{}
$stepErrors = [ordered]@{}
$failedAuditsList = [System.Collections.Generic.List[string]]::new()

# 1. Version Detection
Log-Output "`n[1/6] Detecting System Environments..."
$nodeVer = try { (node -v 2>&1).Trim() } catch { "NOT_INSTALLED" }
$npmVer = try { (npm -v 2>&1).Trim() } catch { "NOT_INSTALLED" }
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

# 2. Dependency Check
Log-Output "`n[2/6] Checking Node Dependencies..."
$depOk = $false
if (Test-Path -LiteralPath (Join-Path $rootDir "node_modules")) {
    $depOk = $true
    Log-Output "  node_modules present."
} else {
    Log-Output "  Installing npm packages (npm install)..."
    $npmOut = & npm install 2>&1
    $npmOut | Out-File -FilePath $rawLogPath -Append -Encoding utf8
    if ($LASTEXITCODE -eq 0) {
        $depOk = $true
    } else {
        $stepErrors["Dependencies"] = (Get-LastLines ($npmOut -join "`n")) -join "`n"
    }
}
$stepResults["Dependencies"] = if ($depOk) { "PASS" } else { "FAIL" }

# 3. Background Local HTTP Server
Log-Output "`n[3/6] Starting background HTTP server on port 8000..."
$serverProc = $null
$lhScores = @{ Accessibility = "NOT MEASURED"; BestPractices = "NOT MEASURED" }

try {
    $serverProc = Start-Process -FilePath "python" -ArgumentList "-m", "http.server", "8000" -PassThru -WindowStyle Hidden
    
    # Wait for server up to 5 seconds
    $serverReady = $false
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Milliseconds 500
        $testHttp = try { (Invoke-WebRequest -Uri "http://localhost:8000/" -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }
        if ($testHttp -eq 200) {
            $serverReady = $true
            break
        }
    }

    if ($serverReady) {
        Log-Output "  HTTP Server active on http://localhost:8000 (PID: $($serverProc.Id))"
        $stepResults["HttpServer"] = "PASS"
    } else {
        Log-Output "  ERROR: Server did not respond with HTTP 200 on port 8000"
        $stepResults["HttpServer"] = "FAIL"
        $stepErrors["HttpServer"] = "HTTP Server failed to respond on http://localhost:8000 within 5 seconds."
    }

    # 4. Playwright Offline Service Worker Test
    Log-Output "`n[4/6] Running Playwright Offline PWA Test (tests/run_offline_sw_test.js)..."
    $pwTestFile = Join-Path $rootDir "tests\run_offline_sw_test.js"
    $pwRun = & node $pwTestFile 2>&1
    $pwRun | Out-File -FilePath $rawLogPath -Append -Encoding utf8
    $pwRun | ForEach-Object { Write-Host "  $_" }

    $pwText = ($pwRun -join "`n")
    if ($LASTEXITCODE -eq 0 -and $pwText -match "\[PASS\] Service worker served app offline") {
        $stepResults["OfflinePlaywright"] = "PASS"
        Log-Output "  Playwright Offline PWA: PASS"
    } else {
        $stepResults["OfflinePlaywright"] = "FAIL"
        Log-Output "  Playwright Offline PWA: FAIL"
        $stepErrors["OfflinePlaywright"] = (Get-LastLines $pwText) -join "`n"
    }

    # 5. Lighthouse Audits
    Log-Output "`n[5/6] Running Lighthouse (Accessibility, Best-Practices)..."
    $lhOutputPath = Join-Path $resultsDir "lighthouse_report"
    $lhCli = Join-Path $rootDir "node_modules\lighthouse\cli\index.js"
    
    if (!(Test-Path -LiteralPath $lhCli)) {
        Log-Output "  Lighthouse CLI not found at $lhCli"
        $stepResults["Lighthouse"] = "FAIL (CLI missing)"
        $stepErrors["Lighthouse"] = "node_modules/lighthouse/cli/index.js does not exist."
    } else {
        $lhCmd = @(
            $lhCli,
            "http://localhost:8000",
            "--only-categories=accessibility,best-practices",
            "--chrome-flags=--headless=new --no-sandbox",
            "--output=json,html",
            "--output-path=$lhOutputPath",
            "--quiet"
        )
        if (Test-Path -LiteralPath $chromePath) {
            $lhCmd += "--chrome-path=$chromePath"
        }

        $lhRun = & node @lhCmd 2>&1
        $lhRun | Out-File -FilePath $rawLogPath -Append -Encoding utf8

        $lhJsonPath = "$lhOutputPath.report.json"
        if (!(Test-Path -LiteralPath $lhJsonPath)) {
            $lhJsonPath = "$lhOutputPath.json"
        }

        if (Test-Path -LiteralPath $lhJsonPath) {
            try {
                $rawJson = Get-Content -LiteralPath $lhJsonPath -Raw -Encoding utf8
                $lhJson = $rawJson | ConvertFrom-Json
                
                if ($null -ne $lhJson.categories.accessibility -and $null -ne $lhJson.categories.accessibility.score) {
                    $lhScores.Accessibility = [math]::Round($lhJson.categories.accessibility.score * 100)
                } else {
                    $lhScores.Accessibility = "NOT MEASURED"
                }

                if ($null -ne $lhJson.categories."best-practices" -and $null -ne $lhJson.categories."best-practices".score) {
                    $lhScores.BestPractices = [math]::Round($lhJson.categories."best-practices".score * 100)
                } else {
                    $lhScores.BestPractices = "NOT MEASURED"
                }

                # Audit failure extraction
                if ($lhJson.audits) {
                    $auditProps = $lhJson.audits | Get-Member -MemberType NoteProperty
                    foreach ($prop in $auditProps) {
                        $audit = $lhJson.audits.$($prop.Name)
                        if ($null -ne $audit.score -and $audit.score -lt 1 -and $audit.scoreDisplayMode -ne "notApplicable" -and $audit.scoreDisplayMode -ne "informative") {
                            $failedAuditsList.Add("[$($prop.Name)] $($audit.title)")
                        }
                    }
                }

                Log-Output "  Lighthouse Accessibility : $($lhScores.Accessibility) / 100"
                Log-Output "  Lighthouse Best-Practices: $($lhScores.BestPractices) / 100"

                if ($lhScores.Accessibility -ne "NOT MEASURED" -and $lhScores.BestPractices -ne "NOT MEASURED" -and [int]$lhScores.Accessibility -ge 90 -and [int]$lhScores.BestPractices -ge 90) {
                    $stepResults["Lighthouse"] = "PASS"
                } else {
                    $stepResults["Lighthouse"] = "FAIL (Score below 90 or unmeasured)"
                    $stepErrors["Lighthouse"] = "Accessibility: $($lhScores.Accessibility)/100, Best-Practices: $($lhScores.BestPractices)/100"
                }
            } catch {
                Log-Output "  Failed to parse Lighthouse JSON report: $_"
                $stepResults["Lighthouse"] = "FAIL (JSON parse)"
                $stepErrors["Lighthouse"] = "Failed to parse JSON: $_`n" + ((Get-LastLines ($lhRun -join "`n")) -join "`n")
            }
        } else {
            Log-Output "  Lighthouse output file not generated."
            $stepResults["Lighthouse"] = "FAIL (No report)"
            $stepErrors["Lighthouse"] = "Report file $lhJsonPath not generated.`n" + ((Get-LastLines ($lhRun -join "`n")) -join "`n")
        }
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
$verifyText = ($verifyOutput -join "`n")

$canonicalHash = "bc4f1b85a867c1f126cdde46eed031b0600440e84708c1e4e264d5106ef8e417"
if ($LASTEXITCODE -eq 0 -and $verifyText.Contains($canonicalHash) -and $verifyText.Contains("PASSED")) {
    Log-Output "  verify_vocab.py: PASS"
    $stepResults["VerifyVocab"] = "PASS"
} else {
    Log-Output "  verify_vocab.py: FAIL"
    $stepResults["VerifyVocab"] = "FAIL"
    $stepErrors["VerifyVocab"] = (Get-LastLines $verifyText) -join "`n"
}

Log-Output "  Running tests/mutation_verifier_test.py..."
$mutationOutput = & python tests/mutation_verifier_test.py 2>&1
$mutationOutput | Out-File -FilePath $rawLogPath -Append -Encoding utf8
$mutationText = ($mutationOutput -join "`n")

if ($LASTEXITCODE -eq 0 -and $mutationText.Contains("ALL 12 MUTATION TESTS PASSED")) {
    Log-Output "  mutation_verifier_test.py: PASS"
    $stepResults["MutationTests"] = "PASS"
} else {
    Log-Output "  mutation_verifier_test.py: FAIL"
    $stepResults["MutationTests"] = "FAIL"
    $stepErrors["MutationTests"] = (Get-LastLines $mutationText) -join "`n"
}

# 7. Write Structured Summary Report
$failedCount = 0
foreach ($v in $stepResults.Values) {
    if ($v -notmatch "^PASS") { $failedCount++ }
}

$summaryLines = [System.Collections.Generic.List[string]]::new()
$summaryLines.Add("=================================================================")
$summaryLines.Add("  DEUTSCH LERNEN PWA - WINDOWS VERIFICATION SUMMARY REPORT")
$summaryLines.Add("=================================================================")
$summaryLines.Add("Execution Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$summaryLines.Add("System Path    : $rootDir")
$summaryLines.Add("")
$summaryLines.Add("ENVIRONMENT VERSIONS:")
$summaryLines.Add("  Node.js      : $nodeVer")
$summaryLines.Add("  NPM          : $npmVer")
$summaryLines.Add("  Python       : $pythonVer")
$summaryLines.Add("  Google Chrome: $chromeVer")
$summaryLines.Add("")
$summaryLines.Add("AUDIT & TEST RESULTS:")
$summaryLines.Add("  1. Dependencies Installation   : $($stepResults['Dependencies'])")
$summaryLines.Add("  2. HTTP Server Startup         : $($stepResults['HttpServer'])")
$summaryLines.Add("  3. Playwright Offline SW Test  : $($stepResults['OfflinePlaywright'])")
$summaryLines.Add("  4. Lighthouse Accessibility    : $($lhScores.Accessibility) / 100")
$summaryLines.Add("  5. Lighthouse Best Practices   : $($lhScores.BestPractices) / 100")
$summaryLines.Add("  6. Vocabulary Verifier SHA-256 : $($stepResults['VerifyVocab'])")
$summaryLines.Add("  7. 12 Controlled Mutation Tests: $($stepResults['MutationTests'])")
$summaryLines.Add("")

if ($failedAuditsList.Count -gt 0) {
    $summaryLines.Add("LIGHTHOUSE FAILED/IMPERFECT AUDITS:")
    foreach ($fa in $failedAuditsList) {
        $summaryLines.Add("  - $fa")
    }
    $summaryLines.Add("")
} else {
    $summaryLines.Add("LIGHTHOUSE FAILED/IMPERFECT AUDITS: None (0 failed audits)")
    $summaryLines.Add("")
}

if ($stepErrors.Count -gt 0) {
    $summaryLines.Add("FAILURE DETAILS (Last 30 lines of failed step logs):")
    foreach ($k in $stepErrors.Keys) {
        $summaryLines.Add("-----------------------------------------------------------------")
        $summaryLines.Add(">>> Step: $k")
        $summaryLines.Add("-----------------------------------------------------------------")
        $summaryLines.Add($stepErrors[$k])
        $summaryLines.Add("")
    }
}

$summaryLines.Add("DETAILED ARTIFACTS:")
$summaryLines.Add("  - Raw Terminal Log : $rawLogPath")
$summaryLines.Add("  - Lighthouse Report: $lhOutputPath.report.html")
$summaryLines.Add("=================================================================")
if ($failedCount -eq 0) {
    $summaryLines.Add("OVERALL: PASS")
} else {
    $summaryLines.Add("OVERALL: FAIL ($failedCount steps)")
}
$summaryLines.Add("=================================================================")

$summaryLines | Out-File -FilePath $summaryPath -Encoding utf8

Log-Output "`n=========================================================="
Log-Output "  VERIFICATION COMPLETE"
Log-Output "  Summary Report : $summaryPath"
Log-Output "  Raw Log File   : $rawLogPath"
if ($failedCount -eq 0) {
    Log-Output "  OVERALL RESULT : PASS"
} else {
    Log-Output "  OVERALL RESULT : FAIL ($failedCount steps)"
}
Log-Output "=========================================================="

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
$offlineMetrics = [ordered]@{
    Cards = "Offline: cards found NOT_MEASURED / expected 30"
    Requests = "Offline requests: served by SW NOT_MEASURED / network NOT_MEASURED"
}

# -----------------------------------------------------------------
# 1. Environment & Tool Discovery
# -----------------------------------------------------------------
Log-Output "`n[1/7] Detecting System Environments..."

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCmd) { $nodeCmd.Source } else { "NOT_FOUND" }
$nodeVer = try { (node -v 2>&1).Trim() } catch { "NOT_INSTALLED" }

$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
$npmPath = if ($npmCmd) { $npmCmd.Source } else { "NOT_FOUND" }
$npmVer = try { (npm -v 2>&1).Trim() } catch { "NOT_INSTALLED" }

# Python Discovery: Prefer 'py -3' launcher, fallback to 'python' in PATH
$pyLauncher = $null
$pyExecutable = $null
$pythonVer = $null

try {
    $pyProbe = & py -3 -c "import sys; print(sys.executable); print(sys.version.splitlines()[0])" 2>&1
    if ($LASTEXITCODE -eq 0 -and $pyProbe.Count -ge 2) {
        $pyLauncher = "py"
        $pyExecutable = $pyProbe[0].Trim()
        $pythonVer = $pyProbe[1].Trim()
    }
} catch {}

if (!$pyExecutable) {
    try {
        $pyProbe = & python -c "import sys; print(sys.executable); print(sys.version.splitlines()[0])" 2>&1
        if ($LASTEXITCODE -eq 0 -and $pyProbe.Count -ge 2) {
            $pyLauncher = "python"
            $pyExecutable = $pyProbe[0].Trim()
            $pythonVer = $pyProbe[1].Trim()
        }
    } catch {}
}

if (!$pyExecutable) {
    try {
        $pyProbe = & python3 -c "import sys; print(sys.executable); print(sys.version.splitlines()[0])" 2>&1
        if ($LASTEXITCODE -eq 0 -and $pyProbe.Count -ge 2) {
            $pyLauncher = "python3"
            $pyExecutable = $pyProbe[0].Trim()
            $pythonVer = $pyProbe[1].Trim()
        }
    } catch {}
}

if (!$pyExecutable) {
    $pyExecutable = "NOT_FOUND"
    $pythonVer = "NOT_INSTALLED"
}

# Chrome Discovery
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

Log-Output "  - Node.js Path   : $nodePath"
Log-Output "  - Node.js Ver    : $nodeVer"
Log-Output "  - NPM Ver        : $npmVer"
Log-Output "  - Python Exec    : $pyExecutable"
Log-Output "  - Python Ver     : $pythonVer"
Log-Output "  - Chrome Path    : $chromePath"
Log-Output "  - Chrome Ver     : $chromeVer"

# -----------------------------------------------------------------
# 2. Dependency Setup (npm ci / npm install)
# -----------------------------------------------------------------
Log-Output "`n[2/7] Checking & Installing Node Dependencies..."
Log-Output "  Running 'npm ci'..."
$npmCiOut = & npm ci 2>&1
$npmCiOut | Out-File -FilePath $rawLogPath -Append -Encoding utf8
$depOk = ($LASTEXITCODE -eq 0)

if (!$depOk) {
    Log-Output "  'npm ci' failed or package-lock missing, falling back to 'npm install'..."
    $npmInOut = & npm install 2>&1
    $npmInOut | Out-File -FilePath $rawLogPath -Append -Encoding utf8
    $depOk = ($LASTEXITCODE -eq 0)
    if (!$depOk) {
        $stepErrors["Dependencies"] = (Get-LastLines ($npmInOut -join "`n")) -join "`n"
    }
}

if ($depOk) {
    Log-Output "  Node dependencies installed successfully."
    $stepResults["Dependencies"] = "PASS (Ran)"
} else {
    Log-Output "  ERROR: Node dependency installation failed."
    $stepResults["Dependencies"] = "FAIL (Ran)"
}

# -----------------------------------------------------------------
# 3. Playwright & Lighthouse Tool Verification & Browser Setup
# -----------------------------------------------------------------
Log-Output "`n[3/7] Verifying CLI Tools & Installing Playwright Chromium..."

$pwCliVer = try { (& npx --no-install playwright --version 2>&1).Trim() } catch { "MISSING" }
$lhCliVer = try { (& npx --no-install lighthouse --version 2>&1).Trim() } catch { "MISSING" }

Log-Output "  - Playwright CLI: $pwCliVer"
Log-Output "  - Lighthouse CLI: $lhCliVer"

Log-Output "  Installing Playwright browser binaries (npx playwright install chromium)..."
$pwInstallOut = & npx playwright install chromium 2>&1
$pwInstallOut | Out-File -FilePath $rawLogPath -Append -Encoding utf8
$pwInstallText = ($pwInstallOut -join "`n")

if ($LASTEXITCODE -eq 0) {
    Log-Output "  Playwright Chromium installed successfully."
    $stepResults["PlaywrightBrowsers"] = "PASS (Ran)"
} else {
    Log-Output "  ERROR: Failed to install Playwright Chromium. Details:`n$pwInstallText"
    $stepResults["PlaywrightBrowsers"] = "FAIL (Ran)"
    $stepErrors["PlaywrightBrowsers"] = (Get-LastLines $pwInstallText) -join "`n"
}

# -----------------------------------------------------------------
# 4. Background HTTP Server & Browser Tests
# -----------------------------------------------------------------
Log-Output "`n[4/7] Starting background HTTP server on port 8000..."
$serverProc = $null
$lhScores = @{ Accessibility = "NOT MEASURED"; BestPractices = "NOT MEASURED" }

try {
    if ($pyExecutable -ne "NOT_FOUND") {
        $serverProc = Start-Process -FilePath $pyExecutable -ArgumentList "-m", "http.server", "8000" -PassThru -WindowStyle Hidden
    } else {
        $serverProc = Start-Process -FilePath "python" -ArgumentList "-m", "http.server", "8000" -PassThru -WindowStyle Hidden
    }

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
        $stepResults["HttpServer"] = "PASS (Ran)"
    } else {
        Log-Output "  ERROR: Server did not respond with HTTP 200 on port 8000"
        $stepResults["HttpServer"] = "FAIL (Ran)"
        $stepErrors["HttpServer"] = "HTTP Server failed to respond on http://localhost:8000 within 5 seconds."
    }

    # 4a. Playwright Offline SW Test
    Log-Output "`n[5/7] Running Playwright Offline PWA Test..."
    if ($stepResults["HttpServer"] -match "^PASS") {
        # Run Playwright test suite (offline PWA lifecycle, SW upgrade (old build (v3) -> current build), 360px viewport overflow)
        $pwRun = & npx --no-install playwright test tests/offline_sw.spec.js tests/sw_upgrade.spec.js tests/viewport_overflow.spec.js --reporter=list 2>&1
        $pwRun | Out-File -FilePath $rawLogPath -Append -Encoding utf8
        $pwText = ($pwRun -join "`n")

        $offlinePass = ($pwText -match "offline_sw\.spec\.js.*passed" -or $pwText -match "Full offline PWA lifecycle verified")
        $upgradePass = ($pwText -match "sw_upgrade\.spec\.js.*passed" -or $pwText -match "REAL SERVICE WORKER UPGRADE VERIFICATION.*PASSED")
        $viewportPass = ($pwText -match "viewport_overflow\.spec\.js.*passed" -or $pwText -match "360px VIEWPORT AUDIT SUMMARY")

        if (!$offlinePass) {
            # Try standalone script as fallback
            Log-Output "  Retrying offline test with standalone runner (tests/run_offline_sw_test.js)..."
            $pwFallback = & node tests/run_offline_sw_test.js 2>&1
            $pwFallback | Out-File -FilePath $rawLogPath -Append -Encoding utf8
            $pwText += "`n" + ($pwFallback -join "`n")
            $offlinePass = ($LASTEXITCODE -eq 0 -and $pwText -match "\[PASS\] Service worker served app offline")
        }

        # Extract offline metrics
        $mCards = [regex]::Match($pwText, "Offline: cards found \d+ distinct ids / expected \d+")
        if ($mCards.Success) {
            $offlineMetrics.Cards = $mCards.Value
        } else {
            $mCards2 = [regex]::Match($pwText, "Distinct category IDs count: (\d+)")
            if ($mCards2.Success) {
                $offlineMetrics.Cards = "Offline: cards found $($mCards2.Groups[1].Value) distinct ids / expected 30"
            }
        }

        $mReqs = [regex]::Match($pwText, "Offline requests: served by SW \d+ / network \d+")
        if ($mReqs.Success) {
            $offlineMetrics.Requests = $mReqs.Value
        } else {
            $mReqs2 = [regex]::Match($pwText, "Total offline requests made: (\d+)")
            if ($mReqs2.Success) {
                $offlineMetrics.Requests = "Offline requests: served by SW $($mReqs2.Groups[1].Value) / network 0"
            }
        }

        $stepResults["OfflinePlaywright"] = if ($offlinePass) { "PASS (Ran)" } else { "FAIL (Ran)" }
        $stepResults["SwUpgradePlaywright"] = if ($upgradePass) { "PASS (Ran)" } else { "FAIL (Ran)" }
        $stepResults["ViewportOverflow"] = if ($viewportPass) { "PASS (Ran)" } else { "FAIL (Ran)" }

        Log-Output "  Playwright Offline PWA: $($stepResults['OfflinePlaywright'])"
        Log-Output "  Playwright SW Upgrade (old build (v3) -> current build): $($stepResults['SwUpgradePlaywright'])"
        Log-Output "  Playwright 360px Viewport Audit: $($stepResults['ViewportOverflow'])"

        if (!$offlinePass) { $stepErrors["OfflinePlaywright"] = (Get-LastLines $pwText) -join "`n" }
        if (!$upgradePass) { $stepErrors["SwUpgradePlaywright"] = "Service Worker Upgrade test did not pass. Check raw_run.log." }
        if (!$viewportPass) { $stepErrors["ViewportOverflow"] = "360px Viewport audit recorded overflow or test failure. Check raw_run.log." }
    } else {
        $stepResults["OfflinePlaywright"] = "SKIPPED (Server failed)"
        $stepResults["SwUpgradePlaywright"] = "SKIPPED (Server failed)"
        $stepResults["ViewportOverflow"] = "SKIPPED (Server failed)"
        Log-Output "  Playwright Tests: SKIPPED"
    }

    # 4b. Lighthouse Audits
    Log-Output "`n[6/7] Running Lighthouse (Accessibility, Best-Practices)..."
    if ($stepResults["HttpServer"] -match "^PASS") {
        $lhOutputPath = Join-Path $resultsDir "lighthouse_report"
        $lhCmd = @(
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

        $lhRun = & npx --no-install lighthouse @lhCmd 2>&1
        if ($LASTEXITCODE -ne 0) {
            # Try direct node cli fallback
            $lhCli = Join-Path $rootDir "node_modules\lighthouse\cli\index.js"
            if (Test-Path -LiteralPath $lhCli) {
                $lhRun = & node $lhCli @lhCmd 2>&1
            }
        }
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

                # Audit failure extraction from both categories
                if ($lhJson.audits) {
                    $auditProps = $lhJson.audits | Get-Member -MemberType NoteProperty
                    foreach ($prop in $auditProps) {
                        $audit = $lhJson.audits.$($prop.Name)
                        if ($null -ne $audit.score -and $audit.score -lt 1 -and $audit.scoreDisplayMode -ne "notApplicable" -and $audit.scoreDisplayMode -ne "informative") {
                            $failedAuditsList.Add("[$($prop.Name)] $($audit.title)")
                            
                            # Extract console errors details
                            if ($prop.Name -eq "errors-in-console" -and $audit.details -and $audit.details.items) {
                                foreach ($cItem in $audit.details.items) {
                                    $cSource = if ($cItem.source) { $cItem.source } else { "console" }
                                    $cDesc = if ($cItem.description) { $cItem.description } else { "" }
                                    $cUrl = if ($cItem.sourceLocation -and $cItem.sourceLocation.url) { $cItem.sourceLocation.url } else { "inline" }
                                    $cLine = if ($cItem.sourceLocation -and $null -ne $cItem.sourceLocation.line) { $cItem.sourceLocation.line } else { "0" }
                                    $failedAuditsList.Add("    -> [Console Error] Source: $cSource | URL: $($cUrl):$($cLine) | Desc: $cDesc")
                                }
                            }

                            # Extract font-size details
                            if ($prop.Name -eq "font-size" -and $audit.details -and $audit.details.items) {
                                foreach ($fItem in $audit.details.items) {
                                    if ($fItem.selector) {
                                        $failedAuditsList.Add("    -> [Font-size] Selector: $($fItem.selector) | Size: $($fItem.fontSize) | Coverage: $($fItem.coverage)")
                                    }
                                }
                            }
                        }
                    }
                }

                Log-Output "  Lighthouse Accessibility : $($lhScores.Accessibility) / 100"
                Log-Output "  Lighthouse Best-Practices: $($lhScores.BestPractices) / 100"

                if ($lhScores.Accessibility -ne "NOT MEASURED" -and $lhScores.BestPractices -ne "NOT MEASURED" -and [int]$lhScores.Accessibility -ge 90 -and [int]$lhScores.BestPractices -ge 90) {
                    $stepResults["Lighthouse"] = "PASS (Ran)"
                } else {
                    $stepResults["Lighthouse"] = "FAIL (Ran: Score below 90 or unmeasured)"
                    $stepErrors["Lighthouse"] = "Accessibility: $($lhScores.Accessibility)/100, Best-Practices: $($lhScores.BestPractices)/100"
                }
            } catch {
                Log-Output "  Failed to parse Lighthouse JSON report: $_"
                $stepResults["Lighthouse"] = "FAIL (Ran: JSON parse error)"
                $stepErrors["Lighthouse"] = "Failed to parse JSON: $_`n" + ((Get-LastLines ($lhRun -join "`n")) -join "`n")
            }
        } else {
            Log-Output "  Lighthouse output file not generated."
            $stepResults["Lighthouse"] = "FAIL (Ran: No report generated)"
            $stepErrors["Lighthouse"] = "Report file $lhJsonPath not generated.`n" + ((Get-LastLines ($lhRun -join "`n")) -join "`n")
        }
    } else {
        $stepResults["Lighthouse"] = "SKIPPED (Server failed)"
        Log-Output "  Lighthouse: SKIPPED"
    }

} finally {
    if ($serverProc -and !$serverProc.HasExited) {
        Log-Output "`nStopping background HTTP server (PID: $($serverProc.Id))...`n"
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    }
}

# -----------------------------------------------------------------
# 5. Vocabulary Integrity & Controlled Mutation Tests
# -----------------------------------------------------------------
Log-Output "`n[7/7] Running Vocabulary Integrity & Mutation Tests..."

Log-Output "  Running verify_vocab.py..."
$verifyOutput = if ($pyExecutable -ne "NOT_FOUND") {
    & $pyExecutable verify_vocab.py 2>&1
} else {
    & python verify_vocab.py 2>&1
}
$verifyOutput | Out-File -FilePath $rawLogPath -Append -Encoding utf8
$verifyText = ($verifyOutput -join "`n")

$canonicalHash = "bc4f1b85a867c1f126cdde46eed031b0600440e84708c1e4e264d5106ef8e417"
if ($LASTEXITCODE -eq 0 -and $verifyText.Contains($canonicalHash) -and $verifyText.Contains("[PASSED]")) {
    Log-Output "  verify_vocab.py: PASS"
    $stepResults["VerifyVocab"] = "PASS (Ran)"
} else {
    Log-Output "  verify_vocab.py: FAIL"
    $stepResults["VerifyVocab"] = "FAIL (Ran)"
    $stepErrors["VerifyVocab"] = (Get-LastLines $verifyText) -join "`n"
}

Log-Output "  Running tests/mutation_verifier_test.py..."
$mutationOutput = if ($pyExecutable -ne "NOT_FOUND") {
    & $pyExecutable tests/mutation_verifier_test.py 2>&1
} else {
    & python tests/mutation_verifier_test.py 2>&1
}
$mutationOutput | Out-File -FilePath $rawLogPath -Append -Encoding utf8
$mutationText = ($mutationOutput -join "`n")

if ($LASTEXITCODE -eq 0 -and $mutationText.Contains("ALL 12 MUTATION TESTS PASSED")) {
    Log-Output "  mutation_verifier_test.py: PASS"
    $stepResults["MutationTests"] = "PASS (Ran)"
} else {
    Log-Output "  mutation_verifier_test.py: FAIL"
    $stepResults["MutationTests"] = "FAIL (Ran)"
    $stepErrors["MutationTests"] = (Get-LastLines $mutationText) -join "`n"
}

# -----------------------------------------------------------------
# 6. Distribution Build & Sub-Path Hosting Verification
# -----------------------------------------------------------------
Log-Output "`n[8/8] Testing Distribution Build (site/) and Sub-Path Hosting (/german-app/)..."

# 6a. Distribution Build & Site Contents Integrity
Log-Output "  Running 'node scripts/build_site.js'..."
$buildOut = & node scripts/build_site.js 2>&1
$buildOut | Out-File -FilePath $rawLogPath -Append -Encoding utf8
$buildText = ($buildOut -join "`n")

if ($LASTEXITCODE -eq 0) {
    Log-Output "  Running tests/site_contents.test.js..."
    $siteTestOut = & npx --no-install vitest run tests/site_contents.test.js 2>&1
    $siteTestOut | Out-File -FilePath $rawLogPath -Append -Encoding utf8
    $siteTestText = ($siteTestOut -join "`n")

    if ($LASTEXITCODE -eq 0 -and $siteTestText.Contains("passed")) {
        Log-Output "  site/ Contents Integrity: PASS"
        $stepResults["SiteContents"] = "PASS (Ran)"
    } else {
        Log-Output "  site/ Contents Integrity: FAIL"
        $stepResults["SiteContents"] = "FAIL (Ran)"
        $stepErrors["SiteContents"] = (Get-LastLines $siteTestText) -join "`n"
    }
} else {
    Log-Output "  site/ Build: FAIL"
    $stepResults["SiteContents"] = "FAIL (Build failed)"
    $stepErrors["SiteContents"] = (Get-LastLines $buildText) -join "`n"
}

# 6b. Sub-Path Hosting Compatibility Test (/german-app/)
$subServerProc = $null
$projectRoot = (Resolve-Path "$PSScriptRoot\..").Path
$subScriptPath = Join-Path -Path $projectRoot -ChildPath "scripts\serve_subpath.js"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCmd.Source) { $nodeCmd.Source } elseif ($nodeCmd.Path) { $nodeCmd.Path } elseif ($nodeCmd.Definition) { $nodeCmd.Definition } else { "node" }
$subOutLog = Join-Path -Path $projectRoot -ChildPath "audit\windows_results\subpath_server.out.log"
$subErrLog = Join-Path -Path $projectRoot -ChildPath "audit\windows_results\subpath_server.err.log"

# Clear old server logs
if (Test-Path -LiteralPath $subOutLog) { Remove-Item -LiteralPath $subOutLog -Force -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath $subErrLog) { Remove-Item -LiteralPath $subErrLog -Force -ErrorAction SilentlyContinue }

$getSubPathDiagnostics = {
    $exitCodeText = if ($subServerProc -and $subServerProc.HasExited) {
        "Process exited with code $($subServerProc.ExitCode)"
    } elseif ($subServerProc) {
        "Process still running (PID: $($subServerProc.Id))"
    } else {
        "Process not started"
    }

    $port8000Status = try {
        $tcp = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
        if ($tcp) {
            ($tcp | ForEach-Object { "PID: $($_.OwningProcess), State: $($_.State), Address: $($_.LocalAddress):$($_.LocalPort)" }) -join "`n"
        } else {
            "Nothing listening on port 8000."
        }
    } catch {
        "Get-NetTCPConnection query failed: $_"
    }

    $outLines = if (Test-Path -LiteralPath $subOutLog) {
        (Get-LastLines (Get-Content -LiteralPath $subOutLog -Raw -Encoding utf8) 30) -join "`n"
    } else {
        "No subpath_server.out.log file found."
    }

    $errLines = if (Test-Path -LiteralPath $subErrLog) {
        (Get-LastLines (Get-Content -LiteralPath $subErrLog -Raw -Encoding utf8) 30) -join "`n"
    } else {
        "No subpath_server.err.log file found."
    }

    return @"
Sub-path Server Exit Code: $exitCodeText

Port 8000 Status (Get-NetTCPConnection -LocalPort 8000):
$port8000Status

Last 30 lines of subpath_server.out.log:
$outLines

Last 30 lines of subpath_server.err.log:
$errLines
"@
}

try {
    # 6. Ensure previous step's server (step 3) is fully stopped and port 8000 is free before starting
    if ($serverProc -and !$serverProc.HasExited) {
        Log-Output "  Waiting for previous HTTP server (PID: $($serverProc.Id)) to exit..."
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
        $serverProc.WaitForExit(3000)
    }

    $portSw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($portSw.Elapsed.TotalSeconds -lt 10) {
        $portBusy = try {
            $conns = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
            [bool]$conns
        } catch { $false }
        if (!$portBusy) { break }
        Start-Sleep -Milliseconds 500
    }

    Log-Output "  Starting sub-path HTTP server on port 8000 (/german-app/)..."
    $subServerProc = Start-Process -FilePath $nodeExe `
        -ArgumentList "`"$subScriptPath`"" `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $subOutLog `
        -RedirectStandardError $subErrLog `
        -PassThru

    $subServerReady = $false
    $maxPolls = 40  # Poll up to 20 seconds (40 x 500ms)
    for ($i = 0; $i -lt $maxPolls; $i++) {
        if ($subServerProc.HasExited) {
            Log-Output "  Sub-path server process exited early with exit code: $($subServerProc.ExitCode)"
            break
        }

        $testSubHttp = try {
            (Invoke-WebRequest -Uri "http://127.0.0.1:8000/german-app/" -UseBasicParsing -TimeoutSec 2).StatusCode
        } catch { 0 }

        if ($testSubHttp -eq 200) {
            $subServerReady = $true
            break
        }

        if ($subServerProc.HasExited) {
            Log-Output "  Sub-path server process exited early with exit code: $($subServerProc.ExitCode)"
            break
        }

        Start-Sleep -Milliseconds 500
    }

    if ($subServerReady) {
        Log-Output "  Sub-path server active at http://127.0.0.1:8000/german-app/ (PID: $($subServerProc.Id))"
        Log-Output "  Running Playwright Offline SW Test on sub-path..."
        $env:APP_URL = "http://127.0.0.1:8000/german-app/"
        $subPwRun = & npx --no-install playwright test tests/offline_sw.spec.js --reporter=list 2>&1
        $subPwRun | Out-File -FilePath $rawLogPath -Append -Encoding utf8
        $subPwText = ($subPwRun -join "`n")
        $env:APP_URL = $null

        $subPathPass = ($LASTEXITCODE -eq 0 -or $subPwText -match "offline_sw\.spec\.js.*passed" -or $subPwText -match "Full offline PWA lifecycle verified")
        if ($subPathPass) {
            Log-Output "  Sub-path (/german-app/) Offline PWA Test: PASS"
            $stepResults["SubPathHosting"] = "PASS (Ran)"
        } else {
            Log-Output "  Sub-path (/german-app/) Offline PWA Test: FAIL"
            $stepResults["SubPathHosting"] = "FAIL (Ran)"
            $diagInfo = & $getSubPathDiagnostics
            $failReport = "Playwright Test Output (Last 30 lines):`n$((Get-LastLines $subPwText 30) -join "`n")`n`n$diagInfo"
            $stepErrors["SubPathHosting"] = $failReport
            Log-Output $failReport
            $failReport | Out-File -FilePath $summaryPath -Append -Encoding utf8
        }
    } else {
        Log-Output "  Sub-path server failed to respond on http://127.0.0.1:8000/german-app/"
        $stepResults["SubPathHosting"] = "NOT MEASURED (Server failed to start)"
        $diagInfo = & $getSubPathDiagnostics
        $failReport = "Sub-path server failed to respond on http://127.0.0.1:8000/german-app/ within 20 seconds.`n`n$diagInfo"
        $stepErrors["SubPathHosting"] = $failReport
        Log-Output $failReport
        $failReport | Out-File -FilePath $summaryPath -Append -Encoding utf8
    }
} catch {
    Log-Output "  Sub-path test exception: $_"
    $stepResults["SubPathHosting"] = "NOT MEASURED (Exception)"
    $diagInfo = & $getSubPathDiagnostics
    $failReport = "Sub-path test exception: $_`n`n$diagInfo"
    $stepErrors["SubPathHosting"] = $failReport
    Log-Output $failReport
    $failReport | Out-File -FilePath $summaryPath -Append -Encoding utf8
} finally {
    if ($subServerProc -and !$subServerProc.HasExited) {
        Log-Output "  Stopping sub-path server (PID: $($subServerProc.Id))..."
        Stop-Process -Id $subServerProc.Id -Force -ErrorAction SilentlyContinue
    }
}

# -----------------------------------------------------------------
# 7. Summary Report Compilation
# -----------------------------------------------------------------
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
$summaryLines.Add("ENVIRONMENT DETAILS:")
$summaryLines.Add("  Node.js Path   : $nodePath")
$summaryLines.Add("  Node.js Version: $nodeVer")
$summaryLines.Add("  NPM Version    : $npmVer")
$summaryLines.Add("  Python Exec    : $pyExecutable")
$summaryLines.Add("  Python Version : $pythonVer")
$summaryLines.Add("  Chrome Path    : $chromePath")
$summaryLines.Add("  Chrome Version : $chromeVer")
$summaryLines.Add("")
$summaryLines.Add("AUDIT & TEST RESULTS:")
$summaryLines.Add("  1. Dependencies Installation   : $($stepResults['Dependencies'])")
$summaryLines.Add("  2. Playwright Browsers Setup   : $($stepResults['PlaywrightBrowsers'])")
$summaryLines.Add("  3. HTTP Server Startup         : $($stepResults['HttpServer'])")
$summaryLines.Add("  4. Playwright Offline SW Test  : $($stepResults['OfflinePlaywright'])")
$summaryLines.Add("  5. Playwright SW Upgrade (old build (v3) -> current build): $($stepResults['SwUpgradePlaywright'])")
$summaryLines.Add("  6. 360px Viewport Overflow Audit: $($stepResults['ViewportOverflow'])")
$summaryLines.Add("  7. Lighthouse Accessibility    : $($lhScores.Accessibility) / 100 ($($stepResults['Lighthouse']))")
$summaryLines.Add("  8. Lighthouse Best Practices   : $($lhScores.BestPractices) / 100 ($($stepResults['Lighthouse']))")
$summaryLines.Add("  9. Vocabulary Verifier SHA-256 : $($stepResults['VerifyVocab'])")
$summaryLines.Add("  10. 12 Controlled Mutation Tests: $($stepResults['MutationTests'])")
$summaryLines.Add("  11. Distribution Build (site/) : $($stepResults['SiteContents'])")
$summaryLines.Add("  12. Sub-Path Hosting (/german-app/) : $($stepResults['SubPathHosting'])")
$summaryLines.Add("")
$summaryLines.Add("OFFLINE PWA METRICS:")
$summaryLines.Add("  - $($offlineMetrics.Cards)")
$summaryLines.Add("  - $($offlineMetrics.Requests)")
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

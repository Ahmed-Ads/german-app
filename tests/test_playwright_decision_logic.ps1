# tests/test_playwright_decision_logic.ps1
# Self-test proving the Playwright JSON / exit-code decision logic in tools/run_windows_checks.ps1

$ErrorActionPreference = "Stop"

function Evaluate-PlaywrightResult {
    param(
        [int]$ExitCode,
        [string]$JsonText
    )

    $result = [PSCustomObject]@{
        Status   = "FAIL"
        Passed   = 0
        Failed   = 0
        Skipped  = 0
        Detail   = ""
    }

    if ([string]::IsNullOrWhiteSpace($JsonText)) {
        $result.Status = "FAIL"
        $result.Detail = "Empty or missing JSON report output (exit code: $ExitCode)"
        return $result
    }

    $parsed = $null
    try {
        $parsed = $JsonText | ConvertFrom-Json
    } catch {
        # Attempt to extract outermost JSON object if surrounded by console log noise
        $braceStart = $JsonText.IndexOf('{')
        $braceEnd = $JsonText.LastIndexOf('}')
        if ($braceStart -ge 0 -and $braceEnd -gt $braceStart) {
            try {
                $sub = $JsonText.Substring($braceStart, $braceEnd - $braceStart + 1)
                $parsed = $sub | ConvertFrom-Json
            } catch {}
        }
    }

    if ($null -eq $parsed -or $null -eq $parsed.stats) {
        $result.Status = "FAIL"
        $result.Detail = "Invalid or unparseable Playwright JSON report (exit code: $ExitCode)"
        return $result
    }

    $expected = if ($null -ne $parsed.stats.expected) { [int]$parsed.stats.expected } else { 0 }
    $unexpected = if ($null -ne $parsed.stats.unexpected) { [int]$parsed.stats.unexpected } else { 0 }
    $skipped = if ($null -ne $parsed.stats.skipped) { [int]$parsed.stats.skipped } else { 0 }
    $flaky = if ($null -ne $parsed.stats.flaky) { [int]$parsed.stats.flaky } else { 0 }

    $result.Passed = $expected
    $result.Failed = $unexpected + $flaky
    $result.Skipped = $skipped
    $result.Detail = "$expected passed, $($result.Failed) failed, $skipped skipped"

    # Rule: A step is PASS only if exit code 0 AND at least 1 test ran AND 0 failed AND 0 skipped; otherwise FAIL
    $totalRan = $expected + $result.Failed
    if ($ExitCode -eq 0 -and $totalRan -ge 1 -and $result.Failed -eq 0 -and $skipped -eq 0) {
        $result.Status = "PASS"
    } else {
        $result.Status = "FAIL"
    }

    return $result
}

Write-Host "=========================================================="
Write-Host "  PLAYWRIGHT SPEC DECISION LOGIC SELF-TEST (PowerShell)"
Write-Host "=========================================================="

# Case 1: Passing JSON (ExitCode 0, expected=1, unexpected=0, skipped=0)
Write-Host "`nTest (1): A passing JSON (exit code 0, 1 passed, 0 failed, 0 skipped)..."
$passJson = '{"stats": {"expected": 1, "unexpected": 0, "skipped": 0, "flaky": 0}}'
$res1 = Evaluate-PlaywrightResult -ExitCode 0 -JsonText $passJson
Write-Host "  Result: $($res1.Status) ($($res1.Detail))"
if ($res1.Status -ne "PASS" -or $res1.Passed -lt 1 -or $res1.Failed -ne 0 -or $res1.Skipped -ne 0) {
    throw "Test (1) FAILED: Expected PASS with Passed >= 1, Failed == 0, Skipped == 0; got $($res1.Status)"
}
Write-Host "  -> Case (1) PASSED: Correctly identified as PASS"

# Case 2: JSON with one failed test (ExitCode 1, expected=0, unexpected=1, skipped=0)
Write-Host "`nTest (2): A JSON with one failed test (exit code 1, unexpected=1)..."
$failJson = '{"stats": {"expected": 0, "unexpected": 1, "skipped": 0, "flaky": 0}}'
$res2 = Evaluate-PlaywrightResult -ExitCode 1 -JsonText $failJson
Write-Host "  Result: $($res2.Status) ($($res2.Detail))"
if ($res2.Status -ne "FAIL" -or $res2.Failed -ne 1) {
    throw "Test (2) FAILED: Expected FAIL with Failed == 1; got $($res2.Status)"
}
Write-Host "  -> Case (2) PASSED: Correctly identified as FAIL"

# Case 3: JSON with a skipped test (ExitCode 0, expected=1, unexpected=0, skipped=1)
Write-Host "`nTest (3): A JSON with a skipped test (exit code 0, expected=1, skipped=1)..."
$skipJson = '{"stats": {"expected": 1, "unexpected": 0, "skipped": 1, "flaky": 0}}'
$res3 = Evaluate-PlaywrightResult -ExitCode 0 -JsonText $skipJson
Write-Host "  Result: $($res3.Status) ($($res3.Detail))"
if ($res3.Status -ne "FAIL" -or $res3.Skipped -ne 1) {
    throw "Test (3) FAILED: Expected FAIL when any test is skipped; got $($res3.Status)"
}
Write-Host "  -> Case (3) PASSED: Correctly identified as FAIL"

# Case 4: Empty output (ExitCode 0, empty string)
Write-Host "`nTest (4): Empty output (exit code 0, empty output)..."
$emptyJson = ""
$res4 = Evaluate-PlaywrightResult -ExitCode 0 -JsonText $emptyJson
Write-Host "  Result: $($res4.Status) ($($res4.Detail))"
if ($res4.Status -ne "FAIL") {
    throw "Test (4) FAILED: Expected FAIL on empty output; got $($res4.Status)"
}
Write-Host "  -> Case (4) PASSED: Correctly identified as FAIL"

# Case 5: Crash (ExitCode 1, error/stack trace output, invalid JSON)
Write-Host "`nTest (5): A process crash (exit code 1, invalid JSON/trace)..."
$crashText = "Error: Process terminated unexpectedly with SIGSEGV`n    at Module._compile (internal/modules/cjs/loader:1256:14)"
$res5 = Evaluate-PlaywrightResult -ExitCode 1 -JsonText $crashText
Write-Host "  Result: $($res5.Status) ($($res5.Detail))"
if ($res5.Status -ne "FAIL") {
    throw "Test (5) FAILED: Expected FAIL on process crash; got $($res5.Status)"
}
Write-Host "  -> Case (5) PASSED: Correctly identified as FAIL"

Write-Host "`n=========================================================="
Write-Host "🎉 ALL 5 SELF-TEST CASES PASSED! ONLY CASE (1) YIELDED PASS."
Write-Host "=========================================================="

# tests/test_mutation_runner_logic.ps1
# Self-test proving the pass/fail detection logic in tools/run_windows_checks.ps1

$ErrorActionPreference = "Stop"

function Test-MutationRunnerDetection([int]$exitCode, [string]$mutationText) {
    if ($exitCode -eq 0 -and $mutationText -match 'MUTATION_SUITE_RESULT: PASS total=(\d+) passed=\1 failed=0') {
        $total = [int]$Matches[1]
        return [PSCustomObject]@{
            Status = "PASS"
            Total  = $total
        }
    } else {
        return [PSCustomObject]@{
            Status = "FAIL"
            Total  = 0
        }
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$mutationTestScript = Join-Path $rootDir "tests\mutation_verifier_test.py"

Write-Host "=========================================================="
Write-Host "  RUNNER LOGIC SELF-TEST (PowerShell)"
Write-Host "=========================================================="

# (a) Real current output from mutation_verifier_test.py
Write-Host "`nTest (a): Real current output from tests/mutation_verifier_test.py..."
$pyExec = if (Get-Command "python" -ErrorAction SilentlyContinue) { "python" } else { "py" }
$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = $pyExec
$pinfo.Arguments = "`"$mutationTestScript`""
$pinfo.RedirectStandardOutput = $true
$pinfo.RedirectStandardError = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true
$pinfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$pinfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8
$p = [System.Diagnostics.Process]::Start($pinfo)
$realOut = $p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()
$p.WaitForExit()
$realExit = $p.ExitCode

$resA = Test-MutationRunnerDetection $realExit $realOut
Write-Host "  Exit Code: $realExit"
Write-Host "  Result   : $($resA.Status) (Total: $($resA.Total) tests)"
if ($resA.Status -ne "PASS" -or $resA.Total -lt 1) {
    throw "Test (a) FAILED: Expected PASS with total > 0, got $($resA.Status) with total=$($resA.Total)"
}
Write-Host "  -> Case (a) PASSED: Correctly identified as PASS"

# (b) Output with one failure line
Write-Host "`nTest (b): Output with one failure line..."
$failOutput = @"
=================================================================
  RUNNING CONTROLLED MUTATION TESTS AGAINST VERIFIER
=================================================================
[OK] ✅ Mutation Test [German_1_char]: PASSED
[FAIL] ❌ Mutation Test [Article_change]: FAILED (Verifier unexpectedly passed with exit code 0 on invalid mutation!)
=================================================================
❌ 1 OF 15 MUTATION & REGRESSION TESTS FAILED.
=================================================================
MUTATION_SUITE_RESULT: FAIL total=15 passed=14 failed=1
"@
$resB = Test-MutationRunnerDetection 1 $failOutput
Write-Host "  Result   : $($resB.Status)"
if ($resB.Status -ne "FAIL") {
    throw "Test (b) FAILED: Expected FAIL, got $($resB.Status)"
}
Write-Host "  -> Case (b) PASSED: Correctly identified as FAIL"

# (c) Empty output
Write-Host "`nTest (c): Empty output..."
$emptyOutput = ""
$resC = Test-MutationRunnerDetection 0 $emptyOutput
Write-Host "  Result   : $($resC.Status)"
if ($resC.Status -ne "FAIL") {
    throw "Test (c) FAILED: Expected FAIL, got $($resC.Status)"
}
Write-Host "  -> Case (c) PASSED: Correctly identified as FAIL"

# (d) Stale 'ALL 12' banner without the new final line
Write-Host "`nTest (d): Stale 'ALL 12' banner without the new final line..."
$staleOutput = @"
=================================================================
  RUNNING CONTROLLED MUTATION TESTS AGAINST VERIFIER
=================================================================
[OK] ✅ Mutation Test [German_1_char]: PASSED (Verifier rejected mutation with 'mismatch')
=================================================================
🎉 ALL 12 MUTATION TESTS PASSED (EXIT CODES VERIFIED NON-ZERO).
=================================================================
"@
$resD = Test-MutationRunnerDetection 0 $staleOutput
Write-Host "  Result   : $($resD.Status)"
if ($resD.Status -ne "FAIL") {
    throw "Test (d) FAILED: Expected FAIL, got $($resD.Status)"
}
Write-Host "  -> Case (d) PASSED: Correctly identified as FAIL"

Write-Host "`n=========================================================="
Write-Host "🎉 ALL 4 SELF-TEST CASES PASSED! PASS ONLY ON CASE (a)."
Write-Host "=========================================================="

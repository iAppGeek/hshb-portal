#Requires -Version 7.2
# Blocking sign-in for accounts that shouldn't be in use (leavers, orphans,
# below-Year-3 and unlinked student accounts). Proposed in a review file with
# an empty Approved column; nothing happens until a person marks a row
# Approved = yes and runs sync-students.ps1 -ApplySignInBlocks. The only
# change ever made is accountEnabled = false: never unblock, delete, rename
# or anything else.

Set-StrictMode -Version Latest

$script:SignInBlockColumns = @(
    'ChangeId', 'Action', 'Upn', 'AccountName', 'StudentCode', 'Reason', 'UserId', 'GeneratedAt', 'Approved'
)

function ConvertTo-SignInBlockRows {
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$SignInBlocks,
        [Parameter(Mandatory)][string]$GeneratedAt
    )

    $rows = foreach ($b in ($SignInBlocks | Sort-Object Reason, Upn)) {
        [pscustomobject][ordered]@{
            ChangeId    = $b.ChangeId
            Action      = 'BLOCK SIGN-IN'
            Upn         = $b.Upn
            AccountName = $b.AccountName
            StudentCode = $b.StudentCode
            Reason      = $b.Reason
            UserId      = $b.UserId
            GeneratedAt = $GeneratedAt
            Approved    = ''
        }
    }
    return $rows
}

function Select-ApprovedSignInBlocks {
    <#
      Pure. Only rows approved AND still proposed by the current plan are
      returned, using the plan's own account id (never ids from the file).
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Rows,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$SignInBlocks
    )

    $current = @{}
    foreach ($b in $SignInBlocks) { $current[$b.ChangeId] = $b }
    $toApply = [System.Collections.Generic.List[object]]::new()
    $skipped = [System.Collections.Generic.List[object]]::new()
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    $notApproved = 0

    foreach ($row in $Rows) {
        if (([string]$row.Approved).Trim() -ine 'yes') { $notApproved++; continue }
        $id = ([string]$row.ChangeId).Trim().ToLowerInvariant()
        if (([string]$row.Action).Trim() -ne 'BLOCK SIGN-IN' -or -not ([string]$row.UserId) -or
            $id -ne (Get-SignInBlockId -UserId ([string]$row.UserId))) {
            $skipped.Add([pscustomobject]@{ Row = $row; Reason = 'row was edited (ChangeId does not match its UserId, or Action changed)' })
            continue
        }
        if (-not $seen.Add($id)) { continue }
        if (-not $current.ContainsKey($id)) {
            $skipped.Add([pscustomobject]@{ Row = $row; Reason = 'no longer proposed (already blocked, linked, or the portal changed)' })
            continue
        }
        $toApply.Add($current[$id])
    }
    return @{ ToApply = $toApply.ToArray(); Skipped = $skipped.ToArray(); NotApproved = $notApproved }
}

function Invoke-SignInBlocks {
    <# Sets accountEnabled = false on each account. Nothing else is sent. #>
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Blocks)

    $result = @{ Blocked = 0; Failed = 0 }
    foreach ($b in $Blocks) {
        try {
            Invoke-StudentGraph -Method PATCH -Uri "v1.0/users/$($b.UserId)" -Body @{ accountEnabled = $false } | Out-Null
            $result.Blocked++
            Write-SyncLog "BLOCKED SIGN-IN $(Protect-Email $b.Upn)"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED block sign-in $(Protect-Email $b.Upn): $($_.Exception.Message)"
        }
    }
    return $result
}

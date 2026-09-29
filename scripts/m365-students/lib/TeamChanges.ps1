#Requires -Version 7.2
# The Team change review file: every proposed Team ADD/REMOVE is written to a
# CSV with an empty Approved column. Nothing changes in Teams until a person
# marks rows Approved = yes and runs sync-students.ps1 -ApplyTeamChanges.

Set-StrictMode -Version Latest

$script:TeamChangeColumns = @(
    'ChangeId', 'Action', 'Team', 'TeamNickname', 'StudentCode', 'StudentName', 'Reason', 'GeneratedAt', 'Approved'
)

function ConvertTo-TeamChangeRows {
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$TeamChanges,
        [Parameter(Mandatory)][string]$GeneratedAt
    )

    $rows = foreach ($c in ($TeamChanges | Sort-Object Team, Action, StudentName)) {
        [pscustomobject][ordered]@{
            ChangeId     = $c.ChangeId
            Action       = $c.Action
            Team         = $c.Team
            TeamNickname = $c.TeamNickname
            StudentCode  = $c.StudentCode
            StudentName  = $c.StudentName
            Reason       = $c.Reason
            GeneratedAt  = $GeneratedAt
            Approved     = ''
        }
    }
    return $rows
}

function Read-ReviewFile {
    <#
      Reads a reviewed CSV written by sync-students.ps1 (Team changes or
      sign-in blocks). Refuses a file that is malformed or too old.
    #>
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string[]]$RequiredColumns,
        [double]$MaxAgeHours = 0,
        [AllowNull()][object]$Now
    )

    if (-not (Test-Path -LiteralPath $Path)) { throw "Review file not found: $Path" }
    $rows = @(Import-Csv -LiteralPath $Path)
    if ($rows.Count -eq 0) { return , @() }
    $columns = @($rows[0].PSObject.Properties.Name)
    foreach ($column in @($RequiredColumns) + @('GeneratedAt', 'Approved')) {
        if ($columns -notcontains $column) { throw "Review file is missing the '$column' column. Use a file written by sync-students.ps1." }
    }
    if ($MaxAgeHours -gt 0) {
        $current = if ($null -ne $Now) { [datetimeoffset]$Now } else { [datetimeoffset]::Now }
        foreach ($row in $rows) {
            $generated = [datetimeoffset]::MinValue
            if (-not [datetimeoffset]::TryParse($row.GeneratedAt, [cultureinfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$generated)) {
                throw 'Review file has a row with an invalid GeneratedAt. Use a file written by sync-students.ps1.'
            }
            if (($current - $generated).TotalHours -gt $MaxAgeHours) {
                throw ("Review file is more than {0} hours old. Run a new dry run and review its file." -f $MaxAgeHours)
            }
        }
    }
    return , $rows
}

function Read-TeamChangeFile {
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory)][string]$Path,
        [double]$MaxAgeHours = 0,
        [AllowNull()][object]$Now
    )
    return Read-ReviewFile -Path $Path -RequiredColumns @('ChangeId', 'Action', 'TeamNickname', 'StudentCode') -MaxAgeHours $MaxAgeHours -Now $Now
}

function Select-ApprovedTeamChanges {
    <#
      Pure. Matches approved rows to the current plan by ChangeId. Only
      changes that are approved AND still in the current plan are returned,
      using the plan's own group and user ids (never ids from the file).
    #>
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Rows,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$TeamChanges
    )

    $current = @{}
    foreach ($c in $TeamChanges) { $current[$c.ChangeId] = $c }
    $toApply = [System.Collections.Generic.List[object]]::new()
    $skipped = [System.Collections.Generic.List[object]]::new()
    $seen = [System.Collections.Generic.HashSet[string]]::new()
    $notApproved = 0

    foreach ($row in $Rows) {
        if (([string]$row.Approved).Trim() -ine 'yes') { $notApproved++; continue }
        $id = ([string]$row.ChangeId).Trim().ToLowerInvariant()
        $skip = { param([string]$Reason) $skipped.Add([pscustomobject]@{ Row = $row; Reason = $Reason }) }
        if ($id -ne (Get-TeamChangeId -Action ([string]$row.Action) -Nickname ([string]$row.TeamNickname) -Code ([string]$row.StudentCode))) {
            & $skip 'row was edited (ChangeId does not match its Action, TeamNickname and StudentCode)'
            continue
        }
        if (-not $seen.Add($id)) { continue }
        if (-not $current.ContainsKey($id)) { & $skip 'no longer needed (already done, or the portal changed)'; continue }
        $change = $current[$id]
        if (-not $change.UserId) { & $skip 'the account does not exist yet: run -Apply first'; continue }
        $toApply.Add($change)
    }

    return @{ ToApply = $toApply.ToArray(); Skipped = $skipped.ToArray(); NotApproved = $notApproved }
}

function Invoke-TeamChanges {
    <# Adds or removes group members. Each change has its own try/catch. #>
    [OutputType([hashtable])]
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Changes)

    $result = @{ Added = 0; Removed = 0; Failed = 0 }
    foreach ($c in $Changes) {
        try {
            if ($c.Action -eq 'ADD') {
                Invoke-StudentGraph -Method POST -Uri "v1.0/groups/$($c.GroupId)/members/`$ref" `
                    -Body @{ '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$($c.UserId)" } | Out-Null
                $result.Added++
            }
            elseif ($c.Action -eq 'REMOVE') {
                Invoke-StudentGraph -Method DELETE -Uri "v1.0/groups/$($c.GroupId)/members/$($c.UserId)/`$ref" | Out-Null
                $result.Removed++
            }
            else { throw "Unknown action '$($c.Action)'." }
            Write-SyncLog "TEAM $($c.Action) [$($c.StudentCode)] $($c.TeamNickname)"
        }
        catch {
            $result.Failed++
            Write-SyncLog -Level ERROR "FAILED team $($c.Action) [$($c.StudentCode)] $($c.TeamNickname): $($_.Exception.Message)"
        }
    }
    return $result
}

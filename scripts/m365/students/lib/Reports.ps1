#Requires -Version 7.2
# Writing CSV reports that contain personal data: owner-only folder and files.

Set-StrictMode -Version Latest

function Set-OwnerOnly {
    [OutputType([void])]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Mode
    )

    if ($IsMacOS -or $IsLinux) {
        & chmod $Mode $Path
        if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on $Path." }
    }
}

function Save-PrivateCsv {
    <#
      Writes rows to a CSV readable only by the current user. The file is
      created and locked down before any data is written to it.
    #>
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Rows,
        # Written as the header when there are no rows.
        [string[]]$Columns = @()
    )

    $directory = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        Set-OwnerOnly -Path $directory -Mode '700'
    }
    New-Item -ItemType File -Path $Path -Force | Out-Null
    Set-OwnerOnly -Path $Path -Mode '600'

    if ($Rows.Count -gt 0) {
        $Rows | Export-Csv -LiteralPath $Path -NoTypeInformation -Encoding utf8
    }
    elseif ($Columns.Count -gt 0) {
        Set-Content -LiteralPath $Path -Value (($Columns | ForEach-Object { '"' + $_ + '"' }) -join ',') -Encoding utf8
    }
    return $Path
}

function Get-ReportPath {
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Directory,
        [Parameter(Mandatory)][string]$Prefix,
        [string]$Stamp = (Get-Date -Format 'yyyyMMdd-HHmmss')
    )

    return Join-Path $Directory ("{0}-{1}.csv" -f $Prefix, $Stamp)
}

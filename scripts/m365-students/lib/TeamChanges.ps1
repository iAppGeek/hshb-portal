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
    return , @($rows)
}

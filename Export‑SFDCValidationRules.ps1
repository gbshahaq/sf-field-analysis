
<# 
.SYNOPSIS
  Export all Salesforce Validation Rules from a local metadata repo to Excel/CSV.

.DESCRIPTION
  - Recurses your repo for:
      * SFDX/MDAPI CustomObject files: *.object-meta.xml, *.object
      * Decomposed child files: validationRules\*.validationRule-meta.xml
  - Extracts all Validation Rules and outputs columns:
      Object, Validation Rule Name, API Name, Description, Error Condition Formula,
      Error Message, Active?, LastModifiedDate
  - LastModifiedDate can come from File timestamp, Git (file or string), or be omitted.
  - Exports to .xlsx (ImportExcel or Excel COM) or falls back to .csv.
  - Excludes package-created rules by default.

.PARAMETER RepoPath
  Root folder of your local Salesforce metadata repository.

.PARAMETER OutputPath
  Desired output .xlsx path (a timestamped name is used if omitted).

.PARAMETER LastModifiedSource
  Source for LastModifiedDate (default: FileTimestamp).
  One of: FileTimestamp | GitFile | GitString | None

.PARAMETER ExcludePackaged
  When $true (default), filters out rules created by a package (namespaced).
  A rule is considered packaged if the Object API name OR rule fullName starts with "<ns>__".

.PARAMETER ForceCsv
  Force CSV output even if ImportExcel/Excel is available.

.NOTES
  - Works on Windows PowerShell 5.1 and PowerShell 7+ (Windows/macOS/Linux).
  - Git-based dates require 'git' in PATH and RepoPath to be a Git repo.
  - In metadata, ValidationRule has no separate label, so Name and API Name both use <fullName>.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$RepoPath,

    [string]$OutputPath = (Join-Path -Path (Get-Location) -ChildPath ("ValidationRules_{0:yyyyMMdd_HHmm}.xlsx" -f (Get-Date))),

    [ValidateSet("FileTimestamp","GitFile","GitString","None")]
    [string]$LastModifiedSource = "FileTimestamp",

    [object]$ExcludePackaged = $true,

    [switch]$ForceCsv
)

# -------------------- Helpers --------------------

# --- normalize boolean-like inputs (true/false/1/0/yes/no/y/n or actual bool) ---
function Convert-ToBool {
    param([Parameter(Mandatory)][object]$Value, [string]$ParamName = 'parameter')
    if ($Value -is [bool]) { return [bool]$Value }
    if ($null -eq $Value)  { return $false }
    $s = $Value.ToString().Trim().ToLowerInvariant()
    switch -Regex ($s) {
        '^(true|1|yes|y)$'  { return $true }
        '^(false|0|no|n)$'  { return $false }
        default { throw "Cannot parse boolean from '$Value' for $ParamName. Use $true or $false." }
    }
}

# Convert the user-supplied value once; use this everywhere below
$ExcludePackaged = Convert-ToBool -Value $ExcludePackaged -ParamName 'ExcludePackaged'

function Write-Detail { param([string]$Message) Write-Verbose $Message }

function Test-CommandExists {
    param([Parameter(Mandatory)] [string]$Name)
    try {
        $null = Get-Command -Name $Name -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Get-XmlText {
    param(
        [Parameter(Mandatory)] [System.Xml.XmlNode]$Node,
        [Parameter(Mandatory)] [string]$LocalName
    )
    $n = $Node.SelectSingleNode("*[local-name() = '$LocalName']")
    if ($null -ne $n) { return $n.InnerText } else { return $null }
}

function Resolve-ObjectName {
    <#
      For monolithic CustomObject files.
    #>
    param(
        [Parameter(Mandatory)] [xml]$XmlDoc,
        [Parameter(Mandatory)] [System.IO.FileInfo]$File
    )
    $fromXml = $XmlDoc.SelectSingleNode("//*[local-name()='CustomObject']/*[local-name()='fullName']")
    if ($fromXml -and $fromXml.InnerText) { return $fromXml.InnerText }

    if ($File.Name -like "*.object-meta.xml") {
        # SFDX: parent folder is the object name
        return $File.Directory.Name
    } elseif ($File.Name -like "*.object") {
        # MDAPI: base name without extension is the object
        return [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
    } else {
        return $File.BaseName
    }
}

function Get-LastModifiedDate {
    param(
        [Parameter(Mandatory)] [System.IO.FileInfo]$File,
        [Parameter(Mandatory)] [string]$RuleFullName,
        [Parameter(Mandatory)] [ValidateSet("FileTimestamp","GitFile","GitString","None")] [string]$Mode
    )

    switch ($Mode) {
        "None"          { return $null }
        "FileTimestamp" { return (Get-Item -LiteralPath $File.FullName).LastWriteTime }
        "GitFile" {
            if (-not (Test-CommandExists git)) { return $null }
            # last commit touching the file
            $gitArgs = @('-C', $File.DirectoryName, 'log', '-1', '--format=%cI', '--', $File.Name)
            try {
                $ts = (git @gitArgs 2>$null) | Select-Object -First 1
            } catch {
                Write-Detail "git log (file) failed for $($File.FullName): $($_.Exception.Message)"
                $ts = $null
            }
            if ($ts) { return [datetime]::Parse($ts.Trim()) } else { return $null }
        }
        "GitString" {
            if (-not (Test-CommandExists git)) { return $null }
            # last commit where the rule fullName string changed in this file
            $gitArgs = @('-C', $File.DirectoryName, 'log', '-S', $RuleFullName, '-1', '--format=%cI', '--', $File.Name)
            $ts = $null
            try {
                $ts = (git @gitArgs 2>$null) | Select-Object -First 1
            } catch {
                Write-Detail "git log -S failed for $($File.FullName): $($_.Exception.Message)"
            }
            if ($ts) { 
                return [datetime]::Parse($ts.Trim())
            } else {
                # fallback to file-level commit if string search yields nothing
                return (Get-LastModifiedDate -File $File -RuleFullName $RuleFullName -Mode "GitFile")
            }
        }
    }
}

function Test-IsPackagedComponent {
    <#
      Returns $true if either the Object API name OR Rule fullName appears namespaced.
      Heuristic: starts with "<ns>__" (managed packages).
      - Unnamespaced custom object "My_Object__c" does NOT match (no leading "<ns>__").
      - Namespaced custom object "ns__My_Object__c" DOES match.
      - If the rule fullName is namespaced ("ns__MyRule"), it will match too.
    #>
    param(
        [Parameter(Mandatory)] [string]$ObjectName,
        [Parameter(Mandatory)] [string]$RuleFullName
    )
    $nsPattern = '^[A-Za-z0-9]+__'
    return ($ObjectName -match $nsPattern) -or ($RuleFullName -match $nsPattern)
}

function New-ValidationRuleRow {
    param(
        [Parameter(Mandatory)] [string]$ObjectName,
        [Parameter(Mandatory)] [string]$ApiName,
        [string]$Description,
        [string]$Formula,
        [string]$ErrorMessage,
        [string]$Active,
        [Nullable[datetime]]$LastModified
    )
    return [pscustomobject]@{
        'Object'                   = $ObjectName
        'Validation Rule Name'     = $ApiName
        'API Name'                 = $ApiName
        'Description'              = $Description
        'Error Condition Formula'  = $Formula
        'Error Message'            = $ErrorMessage
        'Active?'                  = $Active
        'LastModifiedDate'         = $LastModified
    }
}

function Get-ValidationRules-FromObjectFile {
    <#
      Parse validationRules under a monolithic CustomObject file
    #>
    param(
        [Parameter(Mandatory)] [System.IO.FileInfo]$File,
        [Parameter(Mandatory)] [ValidateSet("FileTimestamp","GitFile","GitString","None")] [string]$LastModMode,
        [Parameter(Mandatory)] [bool]$ExcludePackaged
    )
    Write-Detail "Parsing CustomObject file: $($File.FullName)"
    try {
        [xml]$xml = Get-Content -LiteralPath $File.FullName -Raw -ErrorAction Stop
    } catch {
        Write-Warning "XML parse failed: $($File.FullName) - $($_.Exception.Message)"
        return @()
    }

    $objectName = Resolve-ObjectName -XmlDoc $xml -File $File
    $vrNodes = $xml.SelectNodes("//*[local-name()='CustomObject']/*[local-name()='validationRules']")
    if (-not $vrNodes) { return @() }

    # Always return a plain PowerShell array
    $rows = @()
    foreach ($vr in $vrNodes) {
        $apiName     = Get-XmlText -Node $vr -LocalName 'fullName'
        $active      = Get-XmlText -Node $vr -LocalName 'active'
        $desc        = Get-XmlText -Node $vr -LocalName 'description'
        $formula     = Get-XmlText -Node $vr -LocalName 'errorConditionFormula'
        $errorMsg    = Get-XmlText -Node $vr -LocalName 'errorMessage'
        if ($ExcludePackaged -and (Test-IsPackagedComponent -ObjectName $objectName -RuleFullName $apiName)) { continue }

        $lastMod     = Get-LastModifiedDate -File $File -RuleFullName $apiName -Mode $LastModMode
        $rows += (New-ValidationRuleRow -ObjectName $objectName -ApiName $apiName -Description $desc -Formula $formula -ErrorMessage $errorMsg -Active $active -LastModified $lastMod)
    }
    return $rows
}

function Get-ValidationRules-FromChildFile {
    <#
      Parse a decomposed child validation rule file:
      ...\<ObjectName>\validationRules\<RuleName>.validationRule-meta.xml
    #>
    param(
        [Parameter(Mandatory)] [System.IO.FileInfo]$File,
        [Parameter(Mandatory)] [ValidateSet("FileTimestamp","GitFile","GitString","None")] [string]$LastModMode,
        [Parameter(Mandatory)] [bool]$ExcludePackaged
    )
    Write-Detail "Parsing child VR file: $($File.FullName)"
    try {
        [xml]$xml = Get-Content -LiteralPath $File.FullName -Raw -ErrorAction Stop
    } catch {
        Write-Warning "XML parse failed: $($File.FullName) - $($_.Exception.Message)"
        return @()
    }

    # Object name is the parent folder of 'validationRules'
    $vrFolder = $File.Directory
    $objectFolder = $vrFolder.Parent
    $objectName = $objectFolder.Name  # may be Account, MyObject__c, or ns__MyObject__c

    # In decomposed files the root is <ValidationRule> with the same children
    $root = $xml.SelectSingleNode("/*[local-name()='ValidationRule']")
    if (-not $root) { 
        Write-Detail "No <ValidationRule> root in $($File.Name) - skipping"
        return @()
    }

    $apiName  = Get-XmlText -Node $root -LocalName 'fullName'
    $active   = Get-XmlText -Node $root -LocalName 'active'
    $desc     = Get-XmlText -Node $root -LocalName 'description'
    $formula  = Get-XmlText -Node $root -LocalName 'errorConditionFormula'
    $errorMsg = Get-XmlText -Node $root -LocalName 'errorMessage'

    if ($ExcludePackaged -and (Test-IsPackagedComponent -ObjectName $objectName -RuleFullName $apiName)) { 
        return @() 
    }

    $lastMod  = Get-LastModifiedDate -File $File -RuleFullName $apiName -Mode $LastModMode
    # Return a single-element array (not a lone PSCustomObject)
    return @(
        New-ValidationRuleRow -ObjectName $objectName -ApiName $apiName -Description $desc -Formula $formula -ErrorMessage $errorMsg -Active $active -LastModified $lastMod
    )
}

function Export-ValidationRules {
    param(
        [Parameter(Mandatory)] [System.Collections.IEnumerable]$Data,
        [Parameter(Mandatory)] [string]$Path,
        [switch]$ForceCsv
    )

    # If CSV forced, do that.
    if ($ForceCsv) {
        $csvPath = [System.IO.Path]::ChangeExtension($Path, ".csv")
        $Data | Export-Csv -NoTypeInformation -Path $csvPath -Encoding UTF8
        Write-Host "Saved CSV: $csvPath"
        return
    }

    # Option 1: ImportExcel module
    $importExcel = Get-Module -ListAvailable -Name ImportExcel
    if ($importExcel) {
        try {
            $Data | Export-Excel -Path $Path -WorksheetName 'Validation Rules' -AutoSize -FreezeTopRow -AutoFilter -ClearSheet
            Write-Host "Saved Excel: $Path"
            return
        } catch {
            Write-Warning "Export-Excel failed: $($_.Exception.Message). Will try other options..."
        }
    }

    # Option 2: Excel COM (Windows only with Excel)
    # Read-only automatic var in PS 6+; derive our own boolean.
    $onWindows = $IsWindows -or $PSVersionTable.PSEdition -eq 'Desktop' -or
                 [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)

    if ($onWindows) {
        try {
            $excel = New-Object -ComObject Excel.Application
            if ($null -eq $excel) { throw "Excel is not installed." }
            $excel.Visible = $false
            $wb = $excel.Workbooks.Add()
            $ws = $wb.Worksheets.Item(1)
            $ws.Name = 'Validation Rules'

            $headers = @('Object','Validation Rule Name','API Name','Description','Error Condition Formula','Error Message','Active?','LastModifiedDate')
            for ($c=0; $c -lt $headers.Count; $c++) { $ws.Cells.Item(1, $c+1).Value2 = $headers[$c] }

            $r = 2
            foreach ($row in $Data) {
                $ws.Cells.Item($r,1).Value2 = $row.'Object'
                $ws.Cells.Item($r,2).Value2 = $row.'Validation Rule Name'
                $ws.Cells.Item($r,3).Value2 = $row.'API Name'
                $ws.Cells.Item($r,4).Value2 = $row.'Description'
                $ws.Cells.Item($r,5).Value2 = $row.'Error Condition Formula'
                $ws.Cells.Item($r,6).Value2 = $row.'Error Message'
                $ws.Cells.Item($r,7).Value2 = $row.'Active?'
                $ws.Cells.Item($r,8).Value2 = if ($row.'LastModifiedDate') { $row.'LastModifiedDate'.ToString("s") } else { $null }
                $r++
            }

            $ws.UsedRange.EntireColumn.AutoFit() | Out-Null
            $ws.Rows.Item(1).Font.Bold = $true
            $ws.Application.ActiveWindow.SplitRow = 1
            $ws.Application.ActiveWindow.FreezePanes = $true
            $ws.Range("A1:H1").AutoFilter() | Out-Null

            if ([System.IO.Path]::GetExtension($Path) -ne ".xlsx") {
                $Path = [System.IO.Path]::ChangeExtension($Path, ".xlsx")
            }

            try {
                $wb.SaveAs($Path, 51)  # xlOpenXMLWorkbook
            } catch {
                # Ensure the directory exists on locked-down images
                $dir = Split-Path -Parent $Path
                if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
                $wb.SaveAs($Path, 51)
            }
        } catch {
            Write-Warning "Excel COM export failed: $($_.Exception.Message)"
        } finally {
            if ($ws) { [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ws) | Out-Null }
            if ($wb) { try { $wb.Close($true) } catch {} [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null }
            if ($excel) { try { $excel.Quit() } catch {} [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null }
            [GC]::Collect(); [GC]::WaitForPendingFinalizers()
        }
        return
    }

    # Option 3: CSV fallback
    $csvPath = [System.IO.Path]::ChangeExtension($Path, ".csv")
    $Data | Export-Csv -NoTypeInformation -Path $csvPath -Encoding UTF8
    Write-Warning "Wrote CSV instead: $csvPath"
}

# -------------------- Main --------------------

try {
    if (-not (Test-Path -LiteralPath $RepoPath)) {
        throw "RepoPath not found: $RepoPath"
    }

    $allRows = New-Object System.Collections.Generic.List[object]

    # 1) Monolithic CustomObject files
    $objPatterns = @("*.object-meta.xml","*.object")
    $objectFiles = @()
    foreach ($p in $objPatterns) {
        $objectFiles += Get-ChildItem -Path (Join-Path $RepoPath '*') -Recurse -File -Include $p -ErrorAction SilentlyContinue
    }
    if ($objectFiles) {
        Write-Detail ("Found {0} CustomObject file(s)" -f $objectFiles.Count)
        foreach ($file in $objectFiles) {
            $rows = Get-ValidationRules-FromObjectFile -File $file -LastModMode $LastModifiedSource -ExcludePackaged:$ExcludePackaged
            if ($rows) { foreach ($r in @($rows)) { [void]$allRows.Add($r) } }   # <-- safe append
        }
    }

    # 2) Decomposed child ValidationRule files (handles both 'objects' and 'object')
    $childFiles = Get-ChildItem -Path (Join-Path $RepoPath '*') -Recurse -File -Include *.validationRule-meta.xml -ErrorAction SilentlyContinue |
                  Where-Object { $_.Directory.Name -ieq 'validationRules' }
    if ($childFiles) {
        Write-Detail ("Found {0} decomposed ValidationRule file(s)" -f $childFiles.Count)
        foreach ($file in $childFiles) {
            $rows = Get-ValidationRules-FromChildFile -File $file -LastModMode $LastModifiedSource -ExcludePackaged:$ExcludePackaged
            if ($rows) { foreach ($r in @($rows)) { [void]$allRows.Add($r) } }   # <-- safe append
        }
    }

    if ($allRows.Count -eq 0) {
        Write-Warning "No validation rules found in the repository."
        return
    }

    # Stable sort: Object then API Name
    $sorted = $allRows | Sort-Object -Property @{Expression='Object'; Ascending=$true}, @{Expression='API Name'; Ascending=$true}
    Export-ValidationRules -Data $sorted -Path $OutputPath -ForceCsv:$ForceCsv
}
catch {
    Write-Error ("Export failed: {0}" -f $_.Exception.Message)
    throw
}

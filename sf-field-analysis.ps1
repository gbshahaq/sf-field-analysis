<#

Powershell script for reading a local Salesforce metadata repo, finding field references
for a given object, org and repo, and outputting an Excel file with file attributes and dependencies.

Created by Sham Haque and MS CoPilot 24 December 2025

This was the starting point for creating a data dictionary of sorts
#>

param(
    [string]$objectName = "Case",       # Object name parameter
    [string]$orgAlias = "MyOrg"       # Salesforce org alias
)

# Base paths
$outPath = Join-Path $env:USERPROFILE "Projects\MyRepo"
$repoPath = Join-Path $outPath "force-app\main\default"

# Dynamic paths
$objectPath = Join-Path (Join-Path $repoPath "objects") $objectName
$objectFieldsPath = Join-Path $objectPath "fields"
$outputExcel = Join-Path $outPath ("{0}_Field_Analysis.xlsx" -f $objectName)
$tempCsv = Join-Path $outPath ("{0}_LastModified.csv" -f $objectName)

Write-Host "Analyzing fields for object: $objectName"
Write-Host "Repo path: $repoPath"
Write-Host "Output Excel: $outputExcel"

# Step 1: Fetch LastModifiedDate using SF CLI (Tooling API)
Write-Host "Fetching LastModifiedDate for '$objectName' from Salesforce org '$orgAlias'..."
$sfQuery = "SELECT DeveloperName, LastModifiedDate FROM CustomField WHERE TableEnumOrId = '$objectName'"
sf data query --use-tooling-api --target-org $orgAlias --query $sfQuery --result-format csv > $tempCsv

# Load LastModifiedDate into hash table (case-insensitive, handle standard & custom fields)
$lastModifiedMap = @{}
Import-Csv $tempCsv | ForEach-Object {
    $devName = $_.DeveloperName.Trim()
    $lastModifiedMap[$devName.ToLower()] = $_.LastModifiedDate
    $lastModifiedMap["$($devName)__c".ToLower()] = $_.LastModifiedDate
}

$csvRows = (Import-Csv $tempCsv).Count
Write-Host "Fetched $csvRows field entries for LastModifiedDate from Salesforce."

# Step 2: Pre-load metadata files
Write-Host "Pre-loading metadata files into memory..."
$apexFiles = Get-ChildItem -Path (Join-Path $repoPath "classes"), (Join-Path $repoPath "triggers") -Recurse -Include *.cls,*.trigger
$apexContent = @{}
foreach ($file in $apexFiles) { $apexContent[$file.Name] = Get-Content $file.FullName -Raw }

$flowFiles = Get-ChildItem -Path (Join-Path $repoPath "flows") -Recurse -Filter *.flow-meta.xml
$flowContent = @{}
foreach ($file in $flowFiles) { $flowContent[$file.Name] = Get-Content $file.FullName -Raw }

$vrFiles = Get-ChildItem -Path (Join-Path $repoPath "validationRules") -Recurse -Filter *.validationRule-meta.xml
$vrContent = @{}
foreach ($file in $vrFiles) { $vrContent[$file.Name] = Get-Content $file.FullName -Raw }

$dupFiles = Get-ChildItem -Path (Join-Path $repoPath "duplicateRules") -Recurse -Filter *.duplicateRule-meta.xml
$dupContent = @{}
foreach ($file in $dupFiles) { $dupContent[$file.Name] = Get-Content $file.FullName -Raw }

$layoutFiles = Get-ChildItem -Path (Join-Path $repoPath "layouts") -Recurse -Filter "$objectName-*.layout-meta.xml"
$layoutContent = @{}
foreach ($file in $layoutFiles) { $layoutContent[$file.Name] = Get-Content $file.FullName -Raw }

$recordTypeFiles = Get-ChildItem -Path (Join-Path $objectPath "recordTypes") -Recurse -Filter *.recordType-meta.xml
$recordTypeContent = @{}
foreach ($file in $recordTypeFiles) { $recordTypeContent[$file.Name] = Get-Content $file.FullName -Raw }

$flexipageFiles = Get-ChildItem -Path (Join-Path $repoPath "flexipages") -Recurse -Filter *.flexipage-meta.xml
$flexipageContent = @{}
foreach ($file in $flexipageFiles) { $flexipageContent[$file.Name] = Get-Content $file.FullName -Raw }

$reportFiles = Get-ChildItem -Path (Join-Path $repoPath "reports"),(Join-Path $repoPath "reportTypes") -Recurse -Filter *.report-meta.xml
$reportContent = @{}
foreach ($file in $reportFiles) { $reportContent[$file.Name] = Get-Content $file.FullName -Raw }

$emailTemplateFiles = Get-ChildItem -Path (Join-Path $repoPath "email") -Recurse -Filter *.email-meta.xml
$emailTemplateContent = @{}
foreach ($file in $emailTemplateFiles) { $emailTemplateContent[$file.Name] = Get-Content $file.FullName -Raw }


Write-Host "Metadata pre-loading complete."

# Step 3: Process fields
$fieldFiles = Get-ChildItem -Path $objectFieldsPath -Recurse -Filter *.field-meta.xml
$results = @()

Write-Host "Processing $($fieldFiles.Count) fields..."
foreach ($file in $fieldFiles) {
    [xml]$fieldXml = Get-Content $file.FullName
    $fieldName = $fieldXml.CustomField.fullName
    $fieldDesc = $fieldXml.CustomField.description
    $fieldTrack = $fieldXml.CustomField.trackHistory
    $fieldLabel = $fieldXml.CustomField.label
    $fieldType = $fieldXml.CustomField.type
    $fieldFormula = $fieldXml.CustomField.formula
    # field length for relevant data types
    $fieldLength = switch ($fieldType) {
        "Text" { $fieldXml.CustomField.length }
        "Html" { $fieldXml.CustomField.length }
        "LongTextArea" { $fieldXml.CustomField.length }
        "Number" { $fieldXml.CustomField.Precision,$fieldxml.CustomField.scale -join ", " }
        "Currency " { $fieldXml.CustomField.Precision,$fieldxml.CustomField.scale -join ", " }
        Default { "" }
    }
    $fieldReference = if ($fieldType -eq 'Lookup') { $fieldXml.CustomField.ReferenceTo } else { "" }
    $isRequired = if ($fieldXml.CustomField.required -eq 'true') { 'TRUE' } else { 'FALSE' }
    # values or value set name for picklists
    $picklistValues = if ($fieldXml.CustomField.valueSet.valueSetDefinition.value) { ($fieldXml.CustomField.valueSet.valueSetDefinition.value.fullName -join ", ") } 
                        elseif ($fieldxml.CustomField.valueSet.valueSetName) { $fieldxml.CustomField.valueSet.valueSetName } 
                        else { "" }
    $controllingField = if ($fieldXml.CustomField.valueSet.controllingField) { $fieldXml.CustomField.valueSet.controllingField } else { "" }

    # LastModifiedDate (case-insensitive lookup)
    $lookupKey = $fieldName.ToLower()
    $lastModified = if ($lastModifiedMap.ContainsKey($lookupKey)) { $lastModifiedMap[$lookupKey] } else { "" }

    # Layout usage
    $layoutsUsed = ($layoutContent.Keys | Where-Object { $layoutContent[$_] -match $fieldName }) -join "; "

    # Record Types usage
    $recordTypesUsed = ($recordTypeContent.Keys | Where-Object { $recordTypeContent[$_] -match $fieldName }) -join "; "

    # Flexipages usage
    $flexipagesUsed = ($flexipageContent.Keys | Where-Object { $flexipageContent[$_] -match $fieldName }) -join "; "

    # References in automation
    $references = @()
    $references += ($apexContent.Keys | Where-Object { $apexContent[$_] -match $fieldName } | ForEach-Object { "Apex: $_" })
    $references += ($flowContent.Keys | Where-Object { $flowContent[$_] -match $fieldName } | ForEach-Object { "Flow: $_" })
    $references += ($vrContent.Keys | Where-Object { $vrContent[$_] -match $fieldName } | ForEach-Object { "ValidationRule: $_" })
    $references += ($dupContent.Keys | Where-Object { $dupContent[$_] -match $fieldName } | ForEach-Object { "DuplicateRule: $_" })
    $references += ($reportContent.Keys | Where-Object { $reportContent[$_] -match $fieldName } | ForEach-Object { "Report: $_" })
    $references += ($emailTemplateContent.Keys | Where-Object { $emailTemplateContent[$_] -match $fieldName } | ForEach-Object { "EmailTemplate: $_" })
    
    # Add to results
    $results += [PSCustomObject]@{
        FieldName        = $fieldName
        FieldLabel       = $fieldLabel
        Description      = $fieldDesc
        FieldType        = $fieldType
        Formula          = $fieldFormula
        FieldLength      = $fieldLength
        LookupRef        = $fieldReference
        Required         = $isRequired
        HistoryTracking  = $fieldTrack
        PicklistValues   = $picklistValues
        ControllingField = $controllingField
        LastModifiedDate = $lastModified
        Layouts          = $layoutsUsed
        Flexipages       = $flexipagesUsed
        RecordTypes      = $recordTypesUsed
        References       = ($references -join ";`n")
    }
}

Write-Host "Processing complete. Exporting to Excel..."

# Remove existing file if present to prevent data misalignment
if (Test-Path $outputExcel) {
    Remove-Item $outputExcel
}

# Step 4: Export to Excel with formatting
if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
    Install-Module -Name ImportExcel -Scope CurrentUser -Force
}

$results | Export-Excel -Path $outputExcel -Title "$objectName Field Analysis" `
    -WorksheetName "$objectName Fields" -FreezePane @(3,1)

# Apply formatting
$excelPkg = Open-ExcelPackage -Path $outputExcel
$ws = $excelPkg.Workbook.Worksheets["$objectName Fields"]

# Headers: Bold + Center
Set-ExcelRange -Worksheet $ws -Range "2:2" -Bold -HorizontalAlignment Center

# Add AutoFilter to header row
$ws.Cells["2:2"].AutoFilter = $true

# Apply WrapText only to data rows (row 3 and below)
$lastRow = $ws.Dimension.End.Row
Set-ExcelRange -Worksheet $ws -Range "3:$lastRow" -WrapText

# Adjust column widths based on content length (up to 50)
for ($col = 1; $col -le $ws.Dimension.Columns; $col++) {
    $maxLength = 0
    for ($row = 2; $row -le $ws.Dimension.End.Row; $row++) {
        $cellValue = $ws.Cells[$row, $col].Text
        if ($cellValue.Length -gt $maxLength) {
            $maxLength = $cellValue.Length
        }
    }
    # Approximate width: length + padding, capped at 50
    $width = [Math]::Min($maxLength + 5, 50)
    $ws.Column($col).Width = $width
}

Close-ExcelPackage $excelPkg

Write-Host "Excel file generated at: $outputExcel"
#open file
Invoke-Item $outputExcel

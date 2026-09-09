# העברת קבצים מתיקיית Google Drive לתיקייה המקבילה בשרת.
# מעתיק כל סוג קובץ פרט לקבצי אקסל (ראה $ExcludedExtensions).

# חכה ש-Google Drive יהיה מוכן
$maxWait = 60
$waited = 0
while (!(Test-Path "H:\") -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
}

$SourceRoot = "H:\האחסון שלי\Docs"
$TargetRoot = "\\SRV-OD20\Odlight_6271$\Docs"
$LogFile = "C:\Scripts\FileMover.log"

# --- קובץ חדש לשמירת היסטוריית הדילוגים ---
$HistoryFile = "C:\Scripts\SkippedHistory.txt"

# סיומות שלא מועתקות. להוספת סוגים נוספים - הוסף לרשימה, למשל ".xls", ".xlsm"
$ExcludedExtensions = @(".xlsx")

# קבצים ששמם מכיל אחד מהביטויים האלה לא מועתקים
$FilteredWords = @("דוח חודשי", "רשימת קבצים")

function Log($msg) {
    Add-Content -Path $LogFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $msg"
}

# טעינת קבצים שנופו בעבר לזיכרון (כדי שהבדיקה תהיה מהירה במיוחד)
$skippedHistory = @{}
if (Test-Path $HistoryFile) {
    Get-Content $HistoryFile | ForEach-Object { $skippedHistory[$_] = $true }
}

# רישום דילוג פעם אחת בלבד, גם אם הסקריפט רץ שוב ושוב
function Skip-Once($file, $reason) {
    if (!$skippedHistory.ContainsKey($file.FullName)) {
        Log "SKIP (First Time): $reason : $($file.Name)"
        Add-Content -Path $HistoryFile -Value $file.FullName
        $skippedHistory[$file.FullName] = $true
    }
}

Log "START"

try {
    if (!(Test-Path -LiteralPath $SourceRoot)) {
        Log "ERROR: Source not found: $SourceRoot"
        exit
    }

    if (!(Test-Path -LiteralPath $TargetRoot)) {
        Log "ERROR: Target not found: $TargetRoot"
        exit
    }

    $clients = Get-ChildItem -LiteralPath $SourceRoot -Directory
    $copied = 0

    foreach ($client in $clients) {
        $sourcePath = $client.FullName
        $targetPath = Join-Path $TargetRoot $client.Name

        if (!(Test-Path -LiteralPath $targetPath)) { continue }

        $files = Get-ChildItem -LiteralPath $sourcePath -Recurse -File -ErrorAction SilentlyContinue

        foreach ($file in $files) {
            try {
                # --- דילוג על קבצי אקסל ---
                if ($ExcludedExtensions -contains $file.Extension.ToLower()) {
                    Skip-Once $file "Excel file"
                    continue
                }
                # ---------------------------

                # --- מנגנון סינון חכם עם זיכרון ---
                $matchedWord = $FilteredWords | Where-Object { $file.Name -like "*$_*" } | Select-Object -First 1
                if ($matchedWord) {
                    Skip-Once $file "Filtered word in filename ($matchedWord)"
                    continue # מדלג לקובץ הבא
                }
                # -----------------------------------

                $relativePath = $file.FullName.Substring($sourcePath.Length + 1)
                $destFile = Join-Path $targetPath $relativePath
                $destDir = Split-Path $destFile -Parent

                if (Test-Path -LiteralPath $destDir) {
                    Copy-Item -LiteralPath $file.FullName -Destination $destFile -Force -ErrorAction Stop

                    # רישום קובץ שהועתק בהצלחה
                    Log "SUCCESS: Copied $($file.Name) to $destFile"

                    $copied++
                }
            } catch {
                Log "ERROR: $($_.Exception.Message)"
            }
        }
    }

    Log "END - Copied $copied files"

} catch {
    Log "FATAL: $($_.Exception.Message)"
}

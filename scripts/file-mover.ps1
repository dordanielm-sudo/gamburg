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

# חותמת הזמן של הריצה המוצלחת האחרונה. רק קבצים ששונו אחריה מועתקים.
$WatermarkFile = "C:\Scripts\LastRun.txt"
$TimeFormat = "yyyy-MM-dd HH:mm:ss"

# סיומות שלא מועתקות. להוספת סוגים נוספים - הוסף לרשימה, למשל ".xls", ".xlsm"
$ExcludedExtensions = @(".xlsx")

# קבצים ששמם מכיל אחד מהביטויים האלה לא מועתקים
$FilteredWords = @("דוח חודשי", "רשימת קבצים")

# יצירת תיקיית הלוג אם היא לא קיימת - אחרת כל כתיבה ללוג נכשלת בשקט
$LogDir = Split-Path $LogFile -Parent
if (!(Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line   # מוצג גם על המסך בהרצה ידנית
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

$runStart = Get-Date

Log "START"

# ריצה ראשונה: רק רושמים את הזמן ויוצאים. שום דבר קיים לא מועתק רטרואקטיבית.
if (!(Test-Path -LiteralPath $WatermarkFile)) {
    Set-Content -LiteralPath $WatermarkFile -Value $runStart.ToString($TimeFormat)
    Log "BASELINE SET: $($runStart.ToString($TimeFormat)) - nothing copied. Only files changed after this will be copied."
    exit
}

$cutoff = [datetime]::ParseExact((Get-Content -LiteralPath $WatermarkFile -TotalCount 1).Trim(), $TimeFormat, $null)
Log "Copying files modified after $($cutoff.ToString($TimeFormat))"

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
    $tooOld = 0

    foreach ($client in $clients) {
        $sourcePath = $client.FullName
        $targetPath = Join-Path $TargetRoot $client.Name

        if (!(Test-Path -LiteralPath $targetPath)) { continue }

        $files = Get-ChildItem -LiteralPath $sourcePath -Recurse -File -ErrorAction SilentlyContinue

        foreach ($file in $files) {
            try {
                # --- דילוג על קבצים שלא השתנו מאז הריצה הקודמת ---
                if ($file.LastWriteTime -le $cutoff) {
                    $tooOld++
                    continue
                }
                # ---------------------------------------------------

                # --- דילוג על קבצי אקסל ---
                if ($ExcludedExtensions -contains $file.Extension.ToLower()) {
                    Skip-Once $file "Excel file"
                    continue
                }
                # ---------------------------

                # --- מנגנון סינון חכם עם זיכרון ---
                # רווחים כפולים בשם הקובץ מכווצים לרווח בודד, כדי ש-"דוח  חודשי" ייתפס גם הוא
                $normalizedName = ($file.Name -replace '\s+', ' ')
                $matchedWord = $FilteredWords | Where-Object { $normalizedName -like "*$_*" } | Select-Object -First 1
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

    # מעדכנים את החותמת רק אחרי שהלולאה הסתיימה בשלום. זמן תחילת הריצה, לא הסוף,
    # כדי שקובץ ששונה בזמן הריצה עצמה ייתפס בריצה הבאה ולא יאבד.
    Set-Content -LiteralPath $WatermarkFile -Value $runStart.ToString($TimeFormat)

    Log "END - Copied $copied files, skipped $tooOld unchanged"

} catch {
    Log "FATAL: $($_.Exception.Message)"
}

# העברת קבצים מתיקיית Google Drive לתיקייה המקבילה בשרת.
# מעתיק כל סוג קובץ. להחרגות ראה $ExcludedExtensions ו-$FilteredWords.

# חכה ש-Google Drive יהיה מוכן. בריצה מיד אחרי התחברות למשתמש, Drive יכול
# לקחת כמה דקות לעלות - 60 שניות היו קצרות מדי והריצה הייתה נכשלת בלי מקור.
$maxWait = 300
$waited = 0
while (!(Test-Path "H:\") -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
}

$SourceRoot = "H:\האחסון שלי\Docs"
$TargetRoot = "\\SRV-OD20\Odlight_6271$\Docs"
# לוג נפרד מהסקריפט הישן. שניהם על אותו קובץ = כתיבות מתנגשות ושורות שאובדות.
$LogFile = "C:\Scripts\FileMover_NoExcel.log"

# --- קובץ חדש לשמירת היסטוריית הדילוגים ---
$HistoryFile = "C:\Scripts\SkippedHistory.txt"

# חותמת הזמן של הריצה המוצלחת האחרונה. רק קבצים ששונו אחריה מועתקים.
$WatermarkFile = "C:\Scripts\LastRun.txt"
$TimeFormat = "yyyy-MM-dd HH:mm:ss"

# סיומות שלא מועתקות. ריק = הכל עובר, כולל אקסל.
# להחרגה חוזרת: $ExcludedExtensions = @(".xlsx")
$ExcludedExtensions = @()

# קבצים ששמם מכיל אחד מהביטויים האלה לא מועתקים. ריק = אין סינון לפי שם.
# להחזרה: $FilteredWords = @("דוח חודשי", "רשימת קבצים")
$FilteredWords = @()

# גיל מרבי של קובץ להעתקה, בימים. רצפה קשיחה: גם אם החותמת ב-LastRun.txt
# הוזזה אחורה, שום דבר ישן מזה לא יועתק. 30 יום מכסה כיבוי ממושך או תקלה
# של שבועות, ועדיין מונע הצפה של ההיסטוריה כולה.
$MaxAgeDays = 30

# כשבשרת יש כמה תיקיות עם אותה תחילית לאותו לקוח - למשל "(1130_0)אלזם יקיר"
# ו-"(1130_0)אלזם יקיר יעקב" - אין דרך לדעת מהשרת לאיזו מהן עדכנית מפנה.
# $true = להעתיק לכולן, כדי שהקובץ יימצא בכל מצב. $false = לדלג ולרשום בלוג.
$PushToAllMatches = $true

# יצירת תיקיית הלוג אם היא לא קיימת - אחרת כל כתיבה ללוג נכשלת בשקט
$LogDir = Split-Path $LogFile -Parent
if (!(Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# סיבוב לוג: קובץ שעבר 5MB נשמר בצד עם חותמת זמן ומתחילים חדש.
$LogBase = [IO.Path]::GetFileNameWithoutExtension($LogFile)
if ((Test-Path -LiteralPath $LogFile) -and ((Get-Item -LiteralPath $LogFile).Length / 1MB -gt 5)) {
    Rename-Item -LiteralPath $LogFile -NewName ("{0}_{1}.log" -f $LogBase, (Get-Date -Format 'yyyyMMdd_HHmmss'))
}

# לוגים מסובבים בני יותר מ-14 יום נמחקים, כדי שהתיקייה לא תתפח בלי גבול.
Get-ChildItem -LiteralPath $LogDir -Filter "$LogBase`_*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

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

# --- התאמת שם תיקייה בין Drive לשרת -------------------------------------
# השמות בשני הצדדים לא זהים: גרש נשמט בשרת, סדר שם פרטי/משפחה מתהפך,
# ולפעמים נוסף שם בן זוג. לכן ההתאמה נעשית בשלבים, מהמדויק לסובלני,
# ותמיד בתוך אותו מספר לקוח - כדי שקבצים לא ייפלו אצל לקוח אחר.

# כל גרסאות הגרש והמרכאה הבודדת שנראות זהות על המסך
$AposPattern = "[" + [char]0x0027 + [char]0x05F3 + [char]0x2019 + [char]0x2018 + [char]0x0060 + "]"

function Normalize-Name($name) {
    (($name -replace $AposPattern, '') -replace '\s+', ' ').Trim()
}

# מפתח שלא תלוי בסדר המילים: המספר בסוגריים, ואחריו המילים ממוינות
function Get-NameKey($name) {
    $n = Normalize-Name $name
    if ($n -match '^(\(\d+\))\s*(.*)$') { $id = $Matches[1]; $rest = $Matches[2] }
    else { $id = ''; $rest = $n }
    $words = @($rest -split ' ' | Where-Object { $_ }) | Sort-Object
    "$id|" + ($words -join ' ')
}

# מתאים שם תת-תיקייה ב-Drive לשמות המקבילים בשרת. השמות לא זהים: בעדכנית
# נוסף לפעמים שם נוסף - "(1130_0)אלזם יקיר יעקב" מול "(1130_0)אלזם יקיר" ב-Drive.
# התחילית בסוגריים היא המפתח האמיתי. מחזיר מערך שמות (לרוב אחד).
$segCache = @{}
$dirCache = @{}
function Get-SubDirs($parentPath) {
    if (!$dirCache.ContainsKey($parentPath)) {
        $dirCache[$parentPath] = @(Get-ChildItem -LiteralPath $parentPath -Directory -ErrorAction SilentlyContinue)
    }
    return $dirCache[$parentPath]
}

function Resolve-SegmentAll($parentPath, $segment) {
    $ck = "$parentPath|$segment"
    if ($segCache.ContainsKey($ck)) { return $segCache[$ck] }

    $dirs   = Get-SubDirs $parentPath
    $result = @()

    # כל התיקיות שחולקות את התחילית בסוגריים - אותו לקוח, אותו חוצץ
    if ($segment -match '^(\([^)]+\))') {
        $byPrefix = @($dirs | Where-Object { $_.Name.StartsWith($Matches[1]) })
        if ($byPrefix.Count -gt 1) {
            if ($PushToAllMatches) {
                $result = @($byPrefix.Name)
                Log "PUSH TO ALL: $segment -> $($result -join ' | ')"
            }
            else {
                Log "AMBIGUOUS SUBFOLDER under $parentPath for $segment : $(($byPrefix.Name) -join ' | ')"
            }
            $segCache[$ck] = $result
            return $result
        }
        if ($byPrefix.Count -eq 1) {
            $result = @($byPrefix[0].Name)
            if ($result[0] -ne $segment) { Log "MATCHED SUBFOLDER: $segment -> $($result[0])" }
            $segCache[$ck] = $result
            return $result
        }
    }

    # אין תחילית, או שאין התאמה לפיה: שם מדויק, מנורמל, ואז מילים בסדר אחר
    if (Test-Path -LiteralPath (Join-Path $parentPath $segment)) {
        $result = @($segment)
    }
    else {
        $norm = Normalize-Name $segment
        $hit  = @($dirs | Where-Object { (Normalize-Name $_.Name) -eq $norm })
        if ($hit.Count -ne 1) {
            $key = Get-NameKey $segment
            $hit = @($dirs | Where-Object { (Get-NameKey $_.Name) -eq $key })
        }
        if ($hit.Count -eq 1) {
            $result = @($hit[0].Name)
            Log "MATCHED SUBFOLDER: $segment -> $($result[0])"
        }
    }

    $segCache[$ck] = $result
    return $result
}

Log "START"

# ריצה ראשונה: רק רושמים את הזמן ויוצאים. שום דבר קיים לא מועתק רטרואקטיבית.
if (!(Test-Path -LiteralPath $WatermarkFile)) {
    Set-Content -LiteralPath $WatermarkFile -Value $runStart.ToString($TimeFormat)
    Log "BASELINE SET: $($runStart.ToString($TimeFormat)) - nothing copied. Only files changed after this will be copied."
    exit
}

$cutoff = [datetime]::ParseExact((Get-Content -LiteralPath $WatermarkFile -TotalCount 1).Trim(), $TimeFormat, $null)

# הרצפה הקשיחה גוברת על חותמת ישנה מדי.
$ageFloor = $runStart.AddDays(-$MaxAgeDays)
if ($cutoff -lt $ageFloor) {
    Log "Watermark $($cutoff.ToString($TimeFormat)) is older than the $MaxAgeDays day limit - using $($ageFloor.ToString($TimeFormat)) instead"
    $cutoff = $ageFloor
}

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

        # תיקייה כפולה ב-Drive מוצגת ב-Windows עם סיומת " (1)" / " (2)" וכו'.
        # היעד בשרת הוא תמיד התיקייה ללא הסיומת.
        $baseName = $client.Name -replace ' \(\d+\)$', ''
        if ($baseName -ne $client.Name) {
            Log "DUPLICATE: $($client.Name) -> $baseName"
        }

        $targetNames = Resolve-SegmentAll $TargetRoot $baseName
        if ($targetNames.Count -eq 0) {
            Log "SKIP: no server folder for $($client.Name)"
            continue
        }
        $targetPaths = @($targetNames | ForEach-Object { Join-Path $TargetRoot $_ })

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

                # פותרים כל מקטע תיקייה בנתיב בנפרד, כי השם בשרת עשוי להיות שונה,
                # ויכולות להיות כמה תיקיות מתאימות לאותו לקוח.
                $parts    = $relativePath -split '\\'
                $fileName = $parts[-1]
                $dirParts = if ($parts.Count -gt 1) { @($parts[0..($parts.Count - 2)]) } else { @() }

                $destDirs = $targetPaths
                foreach ($part in $dirParts) {
                    $next = @()
                    foreach ($dir in $destDirs) {
                        foreach ($m in (Resolve-SegmentAll $dir $part)) {
                            $next += (Join-Path $dir $m)
                        }
                    }
                    $destDirs = @($next | Select-Object -Unique)
                    if ($destDirs.Count -eq 0) { break }
                }

                if ($destDirs.Count -eq 0) {
                    # תת-תיקייה שקיימת ב-Drive ואין לה מקבילה בשרת. נרשם פעם אחת לקובץ.
                    Skip-Once $file "No destination folder under $($targetPaths -join ' | ') for $relativePath"
                }
                else {
                    foreach ($dir in $destDirs) {
                        if (!(Test-Path -LiteralPath $dir)) { continue }
                        $destFile = Join-Path $dir $fileName
                        Copy-Item -LiteralPath $file.FullName -Destination $destFile -Force -ErrorAction Stop

                        # רישום קובץ שהועתק בהצלחה
                        Log "SUCCESS: Copied $($file.Name) to $destFile"

                        $copied++
                    }
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

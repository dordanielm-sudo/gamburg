# Merges Google Drive client folders that Windows shows with a " (1)" / " (3)"
# suffix back into the folder of the same name without it.
#
# Dry run (prints, changes nothing):
#   powershell -ExecutionPolicy Bypass -File "C:\Scripts\MergeDuplicateFolders.ps1"
# Apply:
#   powershell -ExecutionPolicy Bypass -File "C:\Scripts\MergeDuplicateFolders.ps1" -Apply

param([switch]$Apply)

$src = (Get-ChildItem H:\ -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'Docs') } |
        Select-Object -First 1).FullName + '\Docs'

if (!(Test-Path -LiteralPath $src)) {
    Write-Host "Source not found. Is Google Drive mounted on H:?" -ForegroundColor Red
    exit
}

Write-Host "Source: $src"
Write-Host $(if ($Apply) { "MODE: APPLY - files will be moved" } else { "MODE: DRY RUN - nothing will change" }) -ForegroundColor Yellow
Write-Host ""

$moved = 0; $conflicts = 0; $skipped = 0

$dups = Get-ChildItem -LiteralPath $src -Directory | Where-Object { $_.Name -match ' \(\d+\)$' }

foreach ($dup in $dups) {
    $base    = $dup.Name -replace ' \(\d+\)$', ''
    $baseDir = Join-Path $src $base

    if (!(Test-Path -LiteralPath $baseDir)) {
        Write-Host "NO BASE FOLDER - skipping entirely: $($dup.Name)" -ForegroundColor Red
        $skipped++
        continue
    }

    Write-Host "=== $($dup.Name)  ->  $base" -ForegroundColor Cyan

    $files = Get-ChildItem -LiteralPath $dup.FullName -Recurse -File -ErrorAction SilentlyContinue

    foreach ($f in $files) {
        $rel     = $f.FullName.Substring($dup.FullName.Length + 1)
        $dest    = Join-Path $baseDir $rel
        $destDir = Split-Path $dest -Parent

        if (Test-Path -LiteralPath $dest) {
            $existing = Get-Item -LiteralPath $dest
            Write-Host ("  CONFLICT: {0}  (here {1} bytes / there {2} bytes) - left in place" -f $rel, $f.Length, $existing.Length) -ForegroundColor Yellow
            $conflicts++
            continue
        }

        if ($Apply) {
            try {
                if (!(Test-Path -LiteralPath $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Move-Item -LiteralPath $f.FullName -Destination $dest -ErrorAction Stop
                Write-Host "  MOVED: $rel"
                $moved++
            } catch {
                Write-Host "  ERROR on $rel : $($_.Exception.Message)" -ForegroundColor Red
            }
        } else {
            Write-Host "  WOULD MOVE: $rel"
            $moved++
        }
    }

    $left = @(Get-ChildItem -LiteralPath $dup.FullName -Recurse -File -ErrorAction SilentlyContinue).Count
    if ($left -eq 0) {
        Write-Host "  -> folder is now empty, safe to delete by hand" -ForegroundColor Green
    } else {
        Write-Host "  -> $left file(s) still here" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "----------------------------------------"
Write-Host $(if ($Apply) { "Moved: $moved" } else { "Would move: $moved" })
Write-Host "Conflicts left alone: $conflicts"
Write-Host "Folders skipped (no base): $skipped"

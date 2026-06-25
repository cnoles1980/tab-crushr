$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$assetDir = Join-Path $root "store-assets"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

$cream = [System.Drawing.Color]::FromArgb(233, 227, 223)
$orange = [System.Drawing.Color]::FromArgb(255, 122, 48)
$blue = [System.Drawing.Color]::FromArgb(70, 92, 136)
$black = [System.Drawing.Color]::Black

function New-Bitmap($width, $height) {
  $bitmap = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  return @($bitmap, $graphics)
}

function Draw-RoundedRect($graphics, $brush, $x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $graphics.FillPath($brush, $path)
  $path.Dispose()
}

function Draw-Logo($graphics, $x, $y, $size) {
  $orangeBrush = New-Object System.Drawing.SolidBrush $orange
  $blackBrush = New-Object System.Drawing.SolidBrush $black
  $creamBrush = New-Object System.Drawing.SolidBrush $cream
  $graphics.FillRectangle($orangeBrush, $x, $y, $size, $size)
  $points1 = @(
    [System.Drawing.PointF]::new($x + $size * 0.18, $y + $size * 0.20),
    [System.Drawing.PointF]::new($x + $size * 0.43, $y + $size * 0.20),
    [System.Drawing.PointF]::new($x + $size * 0.49, $y + $size * 0.31),
    [System.Drawing.PointF]::new($x + $size * 0.85, $y + $size * 0.27),
    [System.Drawing.PointF]::new($x + $size * 0.82, $y + $size * 0.48),
    [System.Drawing.PointF]::new($x + $size * 0.52, $y + $size * 0.62),
    [System.Drawing.PointF]::new($x + $size * 0.22, $y + $size * 0.48)
  )
  $points2 = @(
    [System.Drawing.PointF]::new($x + $size * 0.16, $y + $size * 0.56),
    [System.Drawing.PointF]::new($x + $size * 0.78, $y + $size * 0.49),
    [System.Drawing.PointF]::new($x + $size * 0.86, $y + $size * 0.54),
    [System.Drawing.PointF]::new($x + $size * 0.27, $y + $size * 0.68)
  )
  $points3 = @(
    [System.Drawing.PointF]::new($x + $size * 0.22, $y + $size * 0.70),
    [System.Drawing.PointF]::new($x + $size * 0.49, $y + $size * 0.62),
    [System.Drawing.PointF]::new($x + $size * 0.57, $y + $size * 0.76),
    [System.Drawing.PointF]::new($x + $size * 0.84, $y + $size * 0.70),
    [System.Drawing.PointF]::new($x + $size * 0.82, $y + $size * 0.83),
    [System.Drawing.PointF]::new($x + $size * 0.22, $y + $size * 0.83)
  )
  $graphics.FillPolygon($blackBrush, $points1)
  $graphics.FillPolygon($blackBrush, $points2)
  $graphics.FillPolygon($blackBrush, $points3)
  $graphics.FillEllipse($creamBrush, $x + $size * 0.24, $y + $size * 0.22, $size * 0.13, $size * 0.13)
  $orangeBrush.Dispose(); $blackBrush.Dispose(); $creamBrush.Dispose()
}

function Save-Png($bitmap, $path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Make-Screenshot {
  $items = New-Bitmap 1280 800
  $bitmap = $items[0]; $g = $items[1]
  $creamBrush = New-Object System.Drawing.SolidBrush $cream
  $orangeBrush = New-Object System.Drawing.SolidBrush $orange
  $blueBrush = New-Object System.Drawing.SolidBrush $blue
  $blackBrush = New-Object System.Drawing.SolidBrush $black
  $fontTitle = New-Object System.Drawing.Font "Segoe UI", 42, ([System.Drawing.FontStyle]::Bold)
  $fontHead = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Bold)
  $font = New-Object System.Drawing.Font "Segoe UI", 18
  $fontCard = New-Object System.Drawing.Font "Segoe UI", 15
  $fontSmall = New-Object System.Drawing.Font "Segoe UI", 14

  $g.Clear($cream)
  Draw-Logo $g 70 70 110
  $g.DrawString("Tab Crushr", $fontTitle, $blackBrush, 205, 82)
  $g.DrawString("Review, save, and crush duplicate, stale, and superseded tabs.", $font, $blueBrush, 210, 145)

  Draw-RoundedRect $g $blackBrush 70 230 1140 170 10
  $g.DrawString("Lifetime tabs crushed", $fontSmall, $creamBrush, 105, 265)
  $g.DrawString("128", $fontTitle, $orangeBrush, 105, 295)
  $g.DrawString("Lifetime RAM saved", $fontSmall, $creamBrush, 450, 265)
  $g.DrawString("15.0 GB", $fontTitle, $orangeBrush, 450, 295)
  $g.DrawString("Next milestones", $fontSmall, $creamBrush, 820, 265)
  $g.DrawString("250 Tab Crusher", $fontHead, $orangeBrush, 820, 300)

  Draw-RoundedRect $g $blueBrush 70 450 350 210 8
  Draw-RoundedRect $g $blueBrush 465 450 350 210 8
  Draw-RoundedRect $g $orangeBrush 860 450 350 210 8
  $g.DrawString("Duplicates", $fontHead, $creamBrush, 105, 485)
  $g.DrawString("Find duplicate pages.", $fontCard, $creamBrush, 105, 535)
  $g.DrawString("Save for Later", $fontHead, $creamBrush, 500, 485)
  $g.DrawString("Keep URLs without bookmarks.", $fontCard, $creamBrush, 500, 535)
  $g.DrawString("Crush Tabs", $fontHead, $blackBrush, 895, 485)
  $g.DrawString("Close or discard after review.", $fontCard, $blackBrush, 895, 535)

  Save-Png $bitmap (Join-Path $assetDir "screenshot-1280x800.png")
  $g.Dispose(); $bitmap.Dispose()
}

function Make-SmallPromo {
  $items = New-Bitmap 440 280
  $bitmap = $items[0]; $g = $items[1]
  $blackBrush = New-Object System.Drawing.SolidBrush $black
  $creamBrush = New-Object System.Drawing.SolidBrush $cream
  $fontTitle = New-Object System.Drawing.Font "Segoe UI", 32, ([System.Drawing.FontStyle]::Bold)
  $font = New-Object System.Drawing.Font "Segoe UI", 16
  $g.Clear($orange)
  Draw-Logo $g 28 50 90
  $g.DrawString("Tab Crushr", $fontTitle, $blackBrush, 135, 55)
  $g.DrawString("Clean tabs faster", $font, $blackBrush, 138, 112)
  Draw-RoundedRect $g $blackBrush 138 160 230 48 8
  $g.DrawString("Review before crushing", $font, $creamBrush, 156, 172)
  Save-Png $bitmap (Join-Path $assetDir "small-promo-440x280.png")
  $g.Dispose(); $bitmap.Dispose()
}

function Make-Marquee {
  $items = New-Bitmap 1400 560
  $bitmap = $items[0]; $g = $items[1]
  $blackBrush = New-Object System.Drawing.SolidBrush $black
  $creamBrush = New-Object System.Drawing.SolidBrush $cream
  $blueBrush = New-Object System.Drawing.SolidBrush $blue
  $fontTitle = New-Object System.Drawing.Font "Segoe UI", 68, ([System.Drawing.FontStyle]::Bold)
  $font = New-Object System.Drawing.Font "Segoe UI", 28
  $g.Clear($orange)
  Draw-Logo $g 90 120 210
  $g.DrawString("Tab Crushr", $fontTitle, $blackBrush, 360, 135)
  $g.DrawString("Review, save, and crush tab clutter.", $font, $blackBrush, 368, 235)
  Draw-RoundedRect $g $blueBrush 370 315 650 70 10
  $g.DrawString("Local-first cleanup for duplicate and stale tabs", $font, $creamBrush, 405, 330)
  Save-Png $bitmap (Join-Path $assetDir "marquee-promo-1400x560.png")
  $g.Dispose(); $bitmap.Dispose()
}

Make-Screenshot
Make-SmallPromo
Make-Marquee
Write-Output $assetDir

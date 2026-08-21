param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [int]$Width = 64,
  [int]$Height = 96
)

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $InputPath))
try {
  $transparent = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    for ($y = 0; $y -lt $source.Height; $y++) {
      for ($x = 0; $x -lt $source.Width; $x++) {
        $pixel = $source.GetPixel($x, $y)
        $isChroma = $pixel.R -ge 190 -and $pixel.B -ge 150 -and $pixel.G -le 90 -and ($pixel.R + $pixel.B - 2 * $pixel.G) -ge 260
        if ($isChroma) { $transparent.SetPixel($x, $y, [System.Drawing.Color]::Transparent) }
        else { $transparent.SetPixel($x, $y, $pixel) }
      }
    }
    $left = $transparent.Width; $top = $transparent.Height; $right = -1; $bottom = -1
    for ($y = 0; $y -lt $transparent.Height; $y++) {
      for ($x = 0; $x -lt $transparent.Width; $x++) {
        if ($transparent.GetPixel($x, $y).A -gt 16) { $left = [Math]::Min($left, $x); $top = [Math]::Min($top, $y); $right = [Math]::Max($right, $x); $bottom = [Math]::Max($bottom, $y) }
      }
    }
    if ($right -lt $left) { throw "Input contains no visible sprite after chroma removal" }
    $cropWidth = $right - $left + 1; $cropHeight = $bottom - $top + 1
    $padding = 2; $bottomGap = 2
    $scale = [Math]::Min(($Width - 2 * $padding) / $cropWidth, ($Height - $padding - $bottomGap) / $cropHeight)
    $drawWidth = [Math]::Max(1, [Math]::Round($cropWidth * $scale)); $drawHeight = [Math]::Max(1, [Math]::Round($cropHeight * $scale))
    $drawX = [Math]::Round(($Width - $drawWidth) / 2); $drawY = $Height - $bottomGap - $drawHeight
    $output = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $sourceRect = New-Object System.Drawing.Rectangle($left, $top, $cropWidth, $cropHeight)
        $destRect = New-Object System.Drawing.Rectangle($drawX, $drawY, $drawWidth, $drawHeight)
        $graphics.DrawImage($transparent, $destRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
      } finally { $graphics.Dispose() }
      $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
      [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
      $output.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $output.Dispose() }
  } finally { $transparent.Dispose() }
} finally { $source.Dispose() }

param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [int]$Columns = 3,
  [int]$Rows = 4
)

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $InputPath))
try {
  $cellWidth = [Math]::Floor($source.Width / $Columns)
  $cellHeight = [Math]::Floor($source.Height / $Rows)
  $cells = @()
  for ($row = 0; $row -lt $Rows; $row++) {
    for ($column = 0; $column -lt $Columns; $column++) {
      $left = $cellWidth; $top = $cellHeight; $right = -1; $bottom = -1; $pixels = 0
      for ($y = 0; $y -lt $cellHeight; $y++) {
        for ($x = 0; $x -lt $cellWidth; $x++) {
          $pixel = $source.GetPixel($column * $cellWidth + $x, $row * $cellHeight + $y)
          $visible = $pixel.A -gt 16 -and -not ($pixel.R -lt 12 -and $pixel.G -lt 12 -and $pixel.B -lt 12)
          if ($visible) { $pixels++; $left=[Math]::Min($left,$x); $top=[Math]::Min($top,$y); $right=[Math]::Max($right,$x); $bottom=[Math]::Max($bottom,$y) }
        }
      }
      $cells += [PSCustomObject]@{
        Index = $row * $Columns + $column + 1
        Row = $row + 1
        Column = $column + 1
        VisiblePixels = $pixels
        Left = $left
        Top = $top
        Width = if ($right -ge $left) { $right - $left + 1 } else { 0 }
        Height = if ($bottom -ge $top) { $bottom - $top + 1 } else { 0 }
        BottomGap = if ($bottom -ge 0) { $cellHeight - 1 - $bottom } else { $cellHeight }
      }
    }
  }
  $cells | ConvertTo-Json
} finally { $source.Dispose() }

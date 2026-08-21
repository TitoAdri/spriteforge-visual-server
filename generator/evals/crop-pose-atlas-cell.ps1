param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$true)][int]$Column,
  [int]$Columns = 3
)

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $InputPath))
try {
  if ($Column -lt 1 -or $Column -gt $Columns) { throw "Column must be between 1 and $Columns" }
  $width = [Math]::Floor($source.Width / $Columns)
  $rectangle = New-Object System.Drawing.Rectangle((($Column - 1) * $width), 0, $width, $source.Height)
  $output = $source.Clone($rectangle, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
    $output.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $output.Dispose() }
} finally { $source.Dispose() }

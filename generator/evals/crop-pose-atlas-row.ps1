param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$true)][int]$Row,
  [int]$Rows = 4
)

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $InputPath))
try {
  if ($Row -lt 1 -or $Row -gt $Rows) { throw "Row must be between 1 and $Rows" }
  $height = [Math]::Floor($source.Height / $Rows)
  $rectangle = New-Object System.Drawing.Rectangle(0, (($Row - 1) * $height), $source.Width, $height)
  $output = $source.Clone($rectangle, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
    $output.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $output.Dispose() }
} finally { $source.Dispose() }

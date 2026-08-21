param(
  [string[]]$InputPaths,
  [string]$InputDirectory,
  [string]$Pattern = "preview-frame-*.png",
  [Parameter(Mandatory=$true)][string]$OutputPath
)

Add-Type -AssemblyName System.Drawing
if ($InputDirectory) { $InputPaths = @(Get-ChildItem -LiteralPath $InputDirectory -Filter $Pattern | Sort-Object Name | ForEach-Object { $_.FullName }) }
if (-not $InputPaths -or $InputPaths.Count -eq 0) { throw "No preview frames were supplied" }
$images = @($InputPaths | ForEach-Object { [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $_)) })
try {
  $width = ($images | Measure-Object -Property Width -Sum).Sum
  $height = ($images | Measure-Object -Property Height -Maximum).Maximum
  $output = New-Object System.Drawing.Bitmap([int]$width, [int]$height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($output)
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(255, 8, 12, 24))
      $x = 0
      foreach ($frame in $images) { $graphics.DrawImageUnscaled($frame, $x, 0); $x += $frame.Width }
    } finally { $graphics.Dispose() }
    $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
    $output.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $output.Dispose() }
} finally { $images | ForEach-Object { $_.Dispose() } }

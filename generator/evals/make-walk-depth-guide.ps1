param(
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$true)][int]$Index,
  [Parameter(Mandatory=$true)][int]$Total,
  [int]$Width = 256,
  [int]$Height = 384
)

Add-Type -AssemblyName System.Drawing
$output = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(255, 18, 22, 34))
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $scaleX = $Width / 256.0; $scaleY = $Height / 384.0
    function P([double]$x, [double]$y) { New-Object System.Drawing.PointF([float]($x * $scaleX), [float]($y * $scaleY)) }
    $phase = if ($Total -eq 4) { @(0, 1, 5, 0)[$Index] } elseif ($Total -eq 8) { @(0, 1, 2, 3, 5, 6, 7, 0)[$Index] } else { [Math]::Round($Index * 8 / $Total) % 8 }
    $poses = @(
      @{ n=@(118,240,112,290,104,345); f=@(140,240,147,292,151,345) },
      @{ n=@(118,240,92,285,52,340);  f=@(140,240,164,286,199,337) },
      @{ n=@(118,246,91,292,62,345);  f=@(140,246,151,297,171,337) },
      @{ n=@(118,238,122,288,145,331); f=@(140,238,134,286,119,340) },
      @{ n=@(118,232,145,278,180,326); f=@(140,232,124,281,91,342) },
      @{ n=@(118,240,158,286,202,337); f=@(140,240,101,285,55,340) },
      @{ n=@(118,246,145,297,174,337); f=@(140,246,109,292,66,345) },
      @{ n=@(118,238,124,286,119,340); f=@(140,238,145,288,181,331) }
    )[$phase]
    $torsoPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [float](5 * $scaleX))
    $farPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255,255,145,70), [float](11 * $scaleX))
    $nearPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255,45,230,235), [float](13 * $scaleX))
    foreach ($pen in @($torsoPen,$farPen,$nearPen)) { $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square; $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter }
    try {
      $graphics.DrawLine($torsoPen, (P 129 118), (P 129 235))
      $graphics.DrawEllipse($torsoPen, [float](105*$scaleX), [float](65*$scaleY), [float](48*$scaleX), [float](55*$scaleY))
      $graphics.DrawLines($farPen, @((P $poses.f[0] $poses.f[1]), (P $poses.f[2] $poses.f[3]), (P $poses.f[4] $poses.f[5])))
      $graphics.DrawLines($nearPen, @((P $poses.n[0] $poses.n[1]), (P $poses.n[2] $poses.n[3]), (P $poses.n[4] $poses.n[5])))
    } finally { $torsoPen.Dispose(); $farPen.Dispose(); $nearPen.Dispose() }
  } finally { $graphics.Dispose() }
  $resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null
  $output.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $output.Dispose() }

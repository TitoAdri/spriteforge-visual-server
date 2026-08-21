param(
  [string]$Source = "$PSScriptRoot\fixtures\upscaled-test.png",
  [string]$Output = "$PSScriptRoot\fixtures\veo-ranger-9x16.png"
)

Add-Type -AssemblyName System.Drawing

$sourceImage = [System.Drawing.Image]::FromFile($Source)
try {
  $canvas = New-Object System.Drawing.Bitmap 720, 1280, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(255, 255, 0, 255))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver

      # Integer scaling preserves the existing pixel grid. The character stays
      # centered with enough head and foot room for a short walk-in-place test.
      $targetWidth = $sourceImage.Width * 2
      $targetHeight = $sourceImage.Height * 2
      $targetX = [int](($canvas.Width - $targetWidth) / 2)
      $targetY = 280
      $graphics.DrawImage(
        $sourceImage,
        (New-Object System.Drawing.Rectangle $targetX, $targetY, $targetWidth, $targetHeight),
        0,
        0,
        $sourceImage.Width,
        $sourceImage.Height,
        [System.Drawing.GraphicsUnit]::Pixel
      )
    }
    finally {
      $graphics.Dispose()
    }

    $canvas.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $canvas.Dispose()
  }
}
finally {
  $sourceImage.Dispose()
}

Write-Output $Output

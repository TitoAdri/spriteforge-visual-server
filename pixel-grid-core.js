/**
 * Local pixel-grid detector and reconstruction pipeline.
 *
 * The module has no DOM dependencies. Inputs and outputs use the ImageData
 * shape: { width, height, data: Uint8ClampedArray }.
 */

const EDGE_THRESHOLD = 30;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function srgbToLinear(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const normalized = Math.max(0, Math.min(1, value));
  return normalized <= 0.0031308
    ? 3294.6 * normalized
    : (1.055 * normalized ** (1 / 2.4) - 0.055) * 255;
}

function toLinear([r, g, b]) {
  return {
    r: srgbToLinear(r),
    g: srgbToLinear(g),
    b: srgbToLinear(b),
  };
}

function colorDistance(left, right) {
  const r = left.r - right.r;
  const g = left.g - right.g;
  const b = left.b - right.b;
  return r * r * 0.2126 + g * g * 0.7152 + b * b * 0.0722;
}

function makeImageData(width, height, data) {
  const pixels = data ?? new Uint8ClampedArray(width * height * 4);
  if (typeof ImageData !== "undefined") {
    return new ImageData(pixels, width, height);
  }
  return { width, height, data: pixels };
}

function edgeDifference(data, first, second) {
  return (
    Math.abs(data[first] - data[second]) +
    Math.abs(data[first + 1] - data[second + 1]) +
    Math.abs(data[first + 2] - data[second + 2])
  );
}

function findPeriod(signal, maxPeriod) {
  let bestScore = 0;
  let bestPeriod = 1;
  const candidates = [];
  const limit = Math.min(maxPeriod, Math.floor(signal.length / 2));

  for (let period = 2; period <= limit; period += 1) {
    const phases = new Float64Array(period);
    for (let index = 0; index < signal.length; index += 1) {
      phases[index % period] += signal[index];
    }

    const total = phases.reduce((sum, value) => sum + value, 0);
    if (total < 1e-6) continue;

    const score = Math.max(...phases) / total;
    candidates.push({ period, score });
    // Divisors of the real block size can receive the same phase score
    // (for example, both 2 and 4 for a 4x nearest-neighbor image). Prefer the
    // larger tied period so we recover the source grid instead of a sub-grid.
    if (
      score > bestScore + 1e-12 ||
      (Math.abs(score - bestScore) <= 1e-12 && period > bestPeriod)
    ) {
      bestScore = score;
      bestPeriod = period;
    }
  }

  if (candidates.length < 3) {
    return { period: bestPeriod, confidence: 0 };
  }

  candidates.sort((left, right) => right.score - left.score);
  const median = candidates[Math.floor(candidates.length / 2)].score;
  const confidence = Math.max(
    0,
    Math.min(1, (bestScore / (median + 1e-6) - 1) / 3),
  );

  return { period: bestPeriod, confidence };
}

function findOffset(signal, period) {
  const phases = new Float64Array(period);
  for (let index = 0; index < signal.length; index += 1) {
    phases[index % period] += signal[index];
  }

  let strongestIndex = 0;
  let strongestValue = phases[0];
  for (let index = 1; index < period; index += 1) {
    if (phases[index] > strongestValue) {
      strongestValue = phases[index];
      strongestIndex = index;
    }
  }
  return (strongestIndex + 1) % period;
}

function hasLargeColorDiversity(imageData) {
  const colors = new Set();
  const pixelCount = imageData.width * imageData.height;
  const step = Math.max(1, Math.floor(pixelCount / 8192));
  for (let pixel = 0; pixel < pixelCount; pixel += step) {
    const index = pixel * 4;
    colors.add(
      (imageData.data[index] << 16) |
        (imageData.data[index + 1] << 8) |
        imageData.data[index + 2],
    );
    if (colors.size > 1024) return true;
  }
  return false;
}

function spectrumAmplitudes(signal, minimumFrequency, maximumFrequency) {
  const mean = signal.reduce((sum, value) => sum + value, 0) / signal.length;
  const prepared = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const window =
      0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (signal.length - 1));
    prepared[index] = (signal[index] - mean) * window;
  }

  const amplitudes = new Float64Array(maximumFrequency + 1);
  for (
    let frequency = minimumFrequency;
    frequency <= maximumFrequency;
    frequency += 1
  ) {
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < prepared.length; index += 1) {
      const angle = (2 * Math.PI * frequency * index) / prepared.length;
      real += prepared[index] * Math.cos(angle);
      imaginary -= prepared[index] * Math.sin(angle);
    }
    amplitudes[frequency] = Math.hypot(real, imaginary);
  }
  return amplitudes;
}

function nearestPowerOfTwo(value) {
  return 2 ** Math.round(Math.log2(value));
}

/**
 * FFT-style detector for AI images whose apparent pixel cells have fractional
 * sizes. It also suppresses the common 8px latent-grid harmonic when a strong,
 * slightly lower frequency is consistent on both axes.
 */
function detectFractionalGrid(imageData, options) {
  if (!hasLargeColorDiversity(imageData)) return null;

  const { width, height, data } = imageData;
  const vertical = new Float64Array(width - 1);
  const horizontal = new Float64Array(height - 1);

  for (let x = 0; x < width - 1; x += 1) {
    let energy = 0;
    for (let y = 0; y < height; y += 1) {
      const first = (y * width + x) * 4;
      energy += edgeDifference(data, first, first + 4);
    }
    vertical[x] = energy;
  }
  for (let y = 0; y < height - 1; y += 1) {
    let energy = 0;
    for (let x = 0; x < width; x += 1) {
      const first = (y * width + x) * 4;
      energy += edgeDifference(data, first, first + width * 4);
    }
    horizontal[y] = energy;
  }

  const maxBlockSize = options.maxBlockSize ?? 64;
  const maxDetectedWidth = Math.min(
    options.maxDetectedWidth ?? 256,
    Math.floor(width / 2),
  );
  const minDetectedWidth = Math.max(4, Math.ceil(width / maxBlockSize));
  const minDetectedHeight = Math.max(4, Math.ceil(height / maxBlockSize));
  const maxDetectedHeight = Math.min(
    options.maxDetectedHeight ?? 384,
    Math.floor(height / 2),
  );
  const xAmplitudes = spectrumAmplitudes(
    vertical,
    minDetectedWidth,
    maxDetectedWidth,
  );
  const yAmplitudes = spectrumAmplitudes(
    horizontal,
    minDetectedHeight,
    maxDetectedHeight,
  );

  const pairs = [];
  for (let detectedWidth = minDetectedWidth; detectedWidth <= maxDetectedWidth; detectedWidth += 1) {
    const detectedHeight = Math.round((detectedWidth * height) / width);
    if (
      detectedHeight < minDetectedHeight ||
      detectedHeight > maxDetectedHeight
    ) {
      continue;
    }
    pairs.push({
      detectedWidth,
      detectedHeight,
      score: Math.sqrt(
        xAmplitudes[detectedWidth] * yAmplitudes[detectedHeight],
      ),
    });
  }
  pairs.sort((left, right) => right.score - left.score);
  const dominant = pairs[0];
  if (!dominant || dominant.score <= 0) return null;

  let chosen = dominant;
  const dominantScale =
    (width / dominant.detectedWidth + height / dominant.detectedHeight) / 2;
  const latentGridSize = nearestPowerOfTwo(dominantScale);
  const isLatentGridHarmonic =
    latentGridSize >= 4 &&
    Math.abs(dominantScale - latentGridSize) / latentGridSize < 0.02;

  if (isLatentGridHarmonic) {
    const alternatives = pairs.filter(
      (candidate) =>
        candidate.detectedWidth <= dominant.detectedWidth * 0.96 &&
        candidate.detectedWidth >= dominant.detectedWidth * 0.7,
    );
    const alternative = alternatives[0];
    if (alternative && alternative.score >= dominant.score * 0.45) {
      chosen = alternative;
    }
  }

  const scaleX = width / chosen.detectedWidth;
  const scaleY = height / chosen.detectedHeight;
  return {
    blockSize: (scaleX + scaleY) / 2,
    scaleX,
    scaleY,
    detectedWidth: chosen.detectedWidth,
    detectedHeight: chosen.detectedHeight,
    confidence: Math.max(0.1, Math.min(1, chosen.score / dominant.score)),
    offsetX: 0,
    offsetY: 0,
    fractional: true,
  };
}

/**
 * Detects the repeating source-pixel block size.
 *
 * This mirrors the local detector embedded in SpriteCook's public client:
 * edge histograms, phase-period scoring, X/Y reconciliation and offsets.
 */
export function detectPixelGrid(imageData, options = {}) {
  if (options.detector !== "integer") {
    const fractional = detectFractionalGrid(imageData, options);
    if (fractional) return fractional;
  }

  const maxBlockSize = options.maxBlockSize ?? 64;
  const { width, height, data } = imageData;
  if (width < 4 || height < 4) return null;

  const horizontalEdges = new Float64Array(height - 1);
  const verticalEdges = new Float64Array(width - 1);

  for (let y = 0; y < height - 1; y += 1) {
    let changes = 0;
    for (let x = 0; x < width; x += 1) {
      const first = (y * width + x) * 4;
      const second = ((y + 1) * width + x) * 4;
      if (edgeDifference(data, first, second) > EDGE_THRESHOLD) changes += 1;
    }
    horizontalEdges[y] = changes;
  }

  for (let x = 0; x < width - 1; x += 1) {
    let changes = 0;
    for (let y = 0; y < height; y += 1) {
      const first = (y * width + x) * 4;
      const second = (y * width + x + 1) * 4;
      if (edgeDifference(data, first, second) > EDGE_THRESHOLD) changes += 1;
    }
    verticalEdges[x] = changes;
  }

  const xPeriod = findPeriod(verticalEdges, maxBlockSize);
  const yPeriod = findPeriod(horizontalEdges, maxBlockSize);

  let blockSize;
  let confidence;
  if (Math.abs(xPeriod.period - yPeriod.period) <= 1) {
    blockSize = Math.max(xPeriod.period, yPeriod.period);
    confidence = (xPeriod.confidence + yPeriod.confidence) / 2;
  } else if (
    xPeriod.period > 1 &&
    yPeriod.period > 1 &&
    (xPeriod.period % yPeriod.period === 0 ||
      yPeriod.period % xPeriod.period === 0)
  ) {
    blockSize = Math.min(xPeriod.period, yPeriod.period);
    confidence = 0.9 * Math.max(xPeriod.confidence, yPeriod.confidence);
  } else if (xPeriod.confidence > yPeriod.confidence) {
    blockSize = xPeriod.period;
    confidence = 0.7 * xPeriod.confidence;
  } else {
    blockSize = yPeriod.period;
    confidence = 0.7 * yPeriod.confidence;
  }

  if (blockSize < 2 || confidence < 0.05) return null;

  return {
    blockSize,
    detectedWidth: Math.round(width / blockSize),
    detectedHeight: Math.round(height / blockSize),
    confidence,
    offsetX: findOffset(verticalEdges, blockSize),
    offsetY: findOffset(horizontalEdges, blockSize),
  };
}

/**
 * Samples one representative pixel from the center of every detected cell.
 */
export function snapToGrid(imageData, detection) {
  const { width, height, data } = imageData;
  const {
    detectedWidth,
    detectedHeight,
    blockSize,
    offsetX,
    offsetY,
  } = detection;
  const output = makeImageData(detectedWidth, detectedHeight);

  for (let y = 0; y < detectedHeight; y += 1) {
    for (let x = 0; x < detectedWidth; x += 1) {
      const sampleX = detection.fractional
        ? Math.min(Math.round((x + 0.5) * detection.scaleX - 0.5), width - 1)
        : Math.min(
            Math.round(offsetX + x * blockSize + blockSize / 2),
            width - 1,
          );
      const sampleY = detection.fractional
        ? Math.min(Math.round((y + 0.5) * detection.scaleY - 0.5), height - 1)
        : Math.min(
            Math.round(offsetY + y * blockSize + blockSize / 2),
            height - 1,
          );
      const source = (sampleY * width + sampleX) * 4;
      const target = (y * detectedWidth + x) * 4;
      output.data[target] = data[source];
      output.data[target + 1] = data[source + 1];
      output.data[target + 2] = data[source + 2];
      output.data[target + 3] = data[source + 3];
    }
  }
  return output;
}

function collectColors(imageData) {
  const colors = new Map();
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const packed = (data[index] << 16) | (data[index + 1] << 8) | data[index + 2];
    colors.set(packed, (colors.get(packed) ?? 0) + 1);
  }

  return Array.from(colors, ([packed, count]) => {
    const rgb = [(packed >> 16) & 255, (packed >> 8) & 255, packed & 255];
    return { rgb, linear: toLinear(rgb), count };
  }).sort((left, right) => right.count - left.count);
}

function chooseCentroids(colors, count) {
  if (colors.length === 0) return [];
  const centroids = [colors[0].linear];

  while (centroids.length < count && centroids.length < colors.length) {
    let candidate = null;
    let candidateScore = -1;
    for (const color of colors) {
      const distance =
        centroids.reduce(
          (minimum, centroid) =>
            Math.min(minimum, colorDistance(color.linear, centroid)),
          Infinity,
        ) * Math.sqrt(color.count);
      if (distance > candidateScore) {
        candidateScore = distance;
        candidate = color;
      }
    }
    if (!candidate) break;
    centroids.push(candidate.linear);
  }
  return centroids;
}

function buildPalette(colors, count) {
  const centroids = chooseCentroids(colors, count);
  if (centroids.length === 0) return [];

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, weight: 0 }));

    for (const color of colors) {
      let nearest = 0;
      let nearestDistance = Infinity;
      for (let index = 0; index < centroids.length; index += 1) {
        const distance = colorDistance(color.linear, centroids[index]);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      }
      sums[nearest].r += color.linear.r * color.count;
      sums[nearest].g += color.linear.g * color.count;
      sums[nearest].b += color.linear.b * color.count;
      sums[nearest].weight += color.count;
    }

    let changed = false;
    for (let index = 0; index < centroids.length; index += 1) {
      const sum = sums[index];
      if (!sum.weight) continue;
      const next = {
        r: sum.r / sum.weight,
        g: sum.g / sum.weight,
        b: sum.b / sum.weight,
      };
      if (colorDistance(centroids[index], next) > 1e-6) changed = true;
      centroids[index] = next;
    }
    if (!changed) break;
  }

  const unique = new Map();
  for (const centroid of centroids) {
    const rgb = [
      clampByte(linearToSrgb(centroid.r)),
      clampByte(linearToSrgb(centroid.g)),
      clampByte(linearToSrgb(centroid.b)),
    ];
    unique.set(rgb.join(","), rgb);
  }
  return Array.from(unique.values());
}

/**
 * Reduces an image to a weighted k-means palette in linear RGB.
 */
export function quantizePalette(imageData, colorCount, alphaThreshold = 0) {
  const requested = Math.max(1, Math.min(256, Math.round(colorCount) || 1));
  const colors = collectColors(imageData);
  if (colors.length === 0 || colors.length <= requested) {
    return makeImageData(
      imageData.width,
      imageData.height,
      new Uint8ClampedArray(imageData.data),
    );
  }

  const palette = buildPalette(colors, requested).map((rgb) => ({
    rgb,
    linear: toLinear(rgb),
  }));
  const output = makeImageData(
    imageData.width,
    imageData.height,
    new Uint8ClampedArray(imageData.data),
  );

  for (let index = 0; index < output.data.length; index += 4) {
    if (output.data[index + 3] <= alphaThreshold) {
      output.data[index + 3] = 0;
      continue;
    }

    const source = toLinear([
      output.data[index],
      output.data[index + 1],
      output.data[index + 2],
    ]);
    let nearest = palette[0];
    let nearestDistance = colorDistance(source, nearest.linear);
    for (let colorIndex = 1; colorIndex < palette.length; colorIndex += 1) {
      const distance = colorDistance(source, palette[colorIndex].linear);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = palette[colorIndex];
      }
    }
    output.data[index] = nearest.rgb[0];
    output.data[index + 1] = nearest.rgb[1];
    output.data[index + 2] = nearest.rgb[2];
  }
  return output;
}

export function processPixelGrid(imageData, options = {}) {
  const detection = detectPixelGrid(imageData, options);
  if (!detection) {
    return { ok: false, reason: "grid-not-found" };
  }

  const { width, height } = imageData;
  if (
    detection.detectedWidth < 4 ||
    detection.detectedHeight < 4 ||
    detection.detectedWidth >= width ||
    detection.detectedHeight >= height ||
    detection.confidence <= (options.minimumConfidence ?? 0.1)
  ) {
    return { ok: false, reason: "grid-confidence-too-low", detection };
  }

  const snapped = snapToGrid(imageData, detection);
  const output =
    options.colors == null
      ? snapped
      : quantizePalette(snapped, options.colors, options.alphaThreshold ?? 0);

  return { ok: true, detection, snapped, output };
}



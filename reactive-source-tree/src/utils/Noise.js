function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y, seed = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = smoothStep(xf);
  const sy = smoothStep(yf);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const ix0 = a + (b - a) * sx;
  const ix1 = c + (d - c) * sx;

  return ix0 + (ix1 - ix0) * sy;
}

export function createNoise2D(seed = 1) {
  return (x, y, octaves = 3) => {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let normalization = 0;

    for (let i = 0; i < octaves; i += 1) {
      value += valueNoise2D(x * frequency, y * frequency, seed + i * 17) * amplitude;
      normalization += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / normalization;
  };
}

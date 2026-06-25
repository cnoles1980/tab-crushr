import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "icons");
mkdirSync(outDir, { recursive: true });

const COLORS = {
  orange: [255, 122, 48, 255],
  black: [0, 0, 0, 255],
  cream: [233, 227, 223, 255]
};

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function pointInPoly(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function isBlackShape(x, y) {
  const topTab = [
    [0.18, 0.2], [0.43, 0.2], [0.49, 0.31], [0.85, 0.27],
    [0.82, 0.48], [0.52, 0.62], [0.22, 0.48]
  ];
  const midSlash = [
    [0.16, 0.56], [0.78, 0.49], [0.86, 0.54], [0.27, 0.68]
  ];
  const bottomTab = [
    [0.22, 0.7], [0.49, 0.62], [0.57, 0.76], [0.84, 0.7],
    [0.82, 0.83], [0.22, 0.83]
  ];
  return pointInPoly(x, y, topTab) || pointInPoly(x, y, midSlash) || pointInPoly(x, y, bottomTab);
}

function pixelColor(x, y) {
  const dx = x - 0.3;
  const dy = y - 0.3;
  if ((dx * dx + dy * dy) < 0.0038) {
    return COLORS.cream;
  }
  if (isBlackShape(x, y)) {
    return COLORS.black;
  }
  return COLORS.orange;
}

function makePng(size) {
  const scale = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;

  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const accum = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const color = pixelColor((x + (sx + 0.5) / scale) / size, (y + (sy + 0.5) / scale) / size);
          for (let channel = 0; channel < 4; channel += 1) {
            accum[channel] += color[channel];
          }
        }
      }
      for (let channel = 0; channel < 4; channel += 1) {
        raw[offset + channel] = Math.round(accum[channel] / (scale * scale));
      }
      offset += 4;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(outDir, `icon-${size}.png`), makePng(size));
}

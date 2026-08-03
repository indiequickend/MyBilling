// Regenerates the app's PWA/icon assets from a hand-drawn "ink stamp" mark
// (a paper-colored ring + center dot on an ink-blue field — a wax-seal/rubber-stamp
// emblem, matching the ledger-register design direction). No image-library
// dependency: pixels are computed directly and encoded to PNG (and a PNG-in-ICO
// favicon) using only Node's built-in zlib for DEFLATE compression.
//
// Run with: node scripts/generate-pwa-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const INK = [0x1e, 0x3a, 0x5f];
const PAPER = [0xef, 0xf1, 0xf0];

// --- CRC32 (standard IEEE polynomial table) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Encodes an RGBA pixel buffer (size*size*4 bytes) as a PNG file buffer. */
function encodePng(rgba, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk("IHDR", ihdrData);

  // Each scanline prefixed with filter-type byte 0 (None).
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = chunk("IDAT", deflateSync(raw, { level: 9 }));
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Draws the ink-stamp mark at `size`, supersampled `ss`x for anti-aliasing,
 * then box-downsampled back to `size`. Returns a raw RGBA buffer.
 */
function drawMark(size, { ss = 4 } = {}) {
  const big = size * ss;
  const cx = big / 2;
  const cy = big / 2;
  const outerR = big * 0.34;
  const ringHalfThickness = big * 0.035;
  const dotR = big * 0.14;

  const bigBuf = new Uint8Array(big * big * 3);
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const onRing = r >= outerR - ringHalfThickness && r <= outerR + ringHalfThickness;
      const onDot = r <= dotR;
      const color = onRing || onDot ? PAPER : INK;
      const idx = (y * big + x) * 3;
      bigBuf[idx] = color[0];
      bigBuf[idx + 1] = color[1];
      bigBuf[idx + 2] = color[2];
    }
  }

  // Box downsample ss x ss -> 1, then add a fully-opaque alpha channel.
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const idx = ((y * ss + sy) * big + (x * ss + sx)) * 3;
          r += bigBuf[idx];
          g += bigBuf[idx + 1];
          b += bigBuf[idx + 2];
        }
      }
      const n = ss * ss;
      const outIdx = (y * size + x) * 4;
      out[outIdx] = Math.round(r / n);
      out[outIdx + 1] = Math.round(g / n);
      out[outIdx + 2] = Math.round(b / n);
      out[outIdx + 3] = 255;
    }
  }
  return out;
}

function pngAt(size) {
  return encodePng(drawMark(size), size);
}

/** Wraps one or more same-format PNGs into a minimal PNG-in-ICO container. */
function encodeIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const imageDatas = [];
  let offset = 6 + count * 16;
  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size; // height
    entry[2] = 0; // color count
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset of image data
    dirEntries.push(entry);
    imageDatas.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...dirEntries, ...imageDatas]);
}

function write(path, buf) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${buf.length} bytes)`);
}

// Next.js file-based metadata convention: app/icon.png -> <link rel="icon">,
// app/apple-icon.png -> apple-touch-icon meta. No manual <head> wiring needed.
write(join(ROOT, "app/icon.png"), pngAt(512));
write(join(ROOT, "app/apple-icon.png"), pngAt(180));

// Manifest icons: plain "any" 192/512 + a maskable 512 (same artwork; the mark
// is already drawn within the ~80% safe-zone circle maskable requires).
write(join(ROOT, "public/icons/icon-192.png"), pngAt(192));
write(join(ROOT, "public/icons/icon-512.png"), pngAt(512));
write(join(ROOT, "public/icons/icon-512-maskable.png"), pngAt(512));

// Legacy favicon.ico (16 + 32 px, PNG-in-ICO — supported by all modern browsers/OSes).
write(
  join(ROOT, "app/favicon.ico"),
  encodeIco([
    { size: 16, png: pngAt(16) },
    { size: 32, png: pngAt(32) },
  ]),
);

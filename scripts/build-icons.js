// Renders the favicon (same shapes as public/favicon.svg) to PNG and ICO without
// extra dependencies: rounded rectangles are rasterised with 8×8 supersampling.
//
// Output: public/favicon.ico (16, 32, 48 px) and public/apple-touch-icon.png (180 px)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'public');
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// shapes in a 32×32 design grid, painted in order
const SHAPES = [
  { x: 0, y: 0, w: 32, h: 32, r: 7, color: '#c8102e' },
  { x: 5, y: 17, w: 4.5, h: 10, r: 1, color: '#ffffff' },
  { x: 11, y: 11, w: 4.5, h: 16, r: 1, color: '#ffffff' },
  { x: 17, y: 6, w: 4.5, h: 21, r: 1, color: '#d4a017' },
  { x: 23, y: 14, w: 4.5, h: 13, r: 1, color: '#ffffff' },
];

function inside(s, px, py) {
  if (px < s.x || py < s.y || px > s.x + s.w || py > s.y + s.h) return false;
  const cx = Math.min(Math.max(px, s.x + s.r), s.x + s.w - s.r);
  const cy = Math.min(Math.max(py, s.y + s.r), s.y + s.h - s.r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= s.r ** 2;
}

/** RGBA pixels of the icon at `size`×`size`; `square` drops the rounded corners
 *  (for the iOS icon, which iOS rounds itself). */
function render(size, { square = false } = {}) {
  const SS = 8;
  const px = Buffer.alloc(size * size * 4);
  const scale = 32 / size;
  const shapes = square ? [{ ...SHAPES[0], r: 0 }, ...SHAPES.slice(1)] : SHAPES;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const dx = (x + (sx + 0.5) / SS) * scale;
          const dy = (y + (sy + 0.5) / SS) * scale;
          let color = null;
          for (const s of shapes) if (inside(s, dx, dy)) color = s.color;
          if (color) {
            const [cr, cg, cb] = hex(color);
            r += cr; g += cg; b += cb; a += 1;
          }
        }
      }
      const i = (y * size + x) * 4;
      if (a) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO container with embedded PNG images (supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map(i => i.data)]);
}

const icoImages = [16, 32, 48].map(size => ({ size, data: png(size, render(size)) }));
fs.writeFileSync(path.join(OUT, 'favicon.ico'), ico(icoImages));
// iOS rounds the corners itself and doesn't like transparency
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), png(180, render(180, { square: true })));
console.log('favicon.ico (16, 32, 48) and apple-touch-icon.png (180) written');

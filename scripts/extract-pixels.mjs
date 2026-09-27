#!/usr/bin/env node
/**
 * Извлекает данные о каждом пикселе PNG-изображения.
 *
 * Использование:
 *   node scripts/extract-pixels.mjs                       # все форматы (JSON + CSV + матрица)
 *   node scripts/extract-pixels.mjs --image public/foo.png
 *   node scripts/extract-pixels.mjs --formats json,csv,matrix --out pixel-data
 *
 * Выходные файлы (в папке --out, по умолчанию pixel-data/):
 *   pixels.json          — массив из N×M объектов {x, y, r, g, b, a, hex}
 *   pixels.csv           — таблица: x;y;r;g;b;a;hex
 *   matrix-hex.json      — матрица M×N, каждый элемент — hex-цвет ("#rrggbb")
 *   matrix-rgb.json      — матрица M×N, каждый элемент — [r, g, b]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    image: resolve(ROOT, 'public/sheme.png'),
    out: resolve(ROOT, 'pixel-data'),
    formats: ['json', 'csv', 'matrix'],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--image':
        args.image = resolve(ROOT, argv[++i]);
        break;
      case '--out':
        args.out = resolve(ROOT, argv[++i]);
        break;
      case '--formats':
        args.formats = argv[++i].split(',').map((s) => s.trim().toLowerCase());
        break;
      case '--help':
      case '-h':
        console.log(`
Извлечение данных о пикселях PNG

  --image <путь>      путь к PNG (по умолчанию public/sheme.png)
  --out <папка>       папка для результатов (по умолчанию pixel-data/)
  --formats <список>  json,csv,matrix (по умолчанию все)
`);
        process.exit(0);
    }
  }
  return args;
}

const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const rgbToHex = (r, g, b) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

function main() {
  const { image, out, formats } = parseArgs(process.argv.slice(2));

  console.log(`Читаю: ${image}`);
  const png = PNG.sync.read(readFileSync(image));
  const { width, height, data } = png;

  console.log(`Размер: ${width} × ${height}, всего пикселей: ${width * height}`);

  // --- Общий список пикселей ---
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      pixels.push({ x, y, r, g, b, a, hex: rgbToHex(r, g, b) });
    }
  }

  // --- Матрицы ---
  const matrixHex = [];
  const matrixRgb = [];
  for (let y = 0; y < height; y++) {
    const rowHex = [];
    const rowRgb = [];
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      rowHex.push(rgbToHex(r, g, b));
      rowRgb.push([r, g, b]);
    }
    matrixHex.push(rowHex);
    matrixRgb.push(rowRgb);
  }

  mkdirSync(out, { recursive: true });
  const baseName = basename(image).replace(/\.png$/i, '');

  const files = {
    json: ['pixels.json', JSON.stringify(pixels)],
    csv: [
      'pixels.csv',
      ['x;y;r;g;b;a;hex', ...pixels.map((p) => `${p.x};${p.y};${p.r};${p.g};${p.b};${p.a};${p.hex}`)].join('\n'),
    ],
    matrix: ['matrix-hex.json', JSON.stringify(matrixHex)],
  };

  for (const fmt of formats) {
    if (!files[fmt]) {
      console.warn(`Неизвестный формат: ${fmt}`);
      continue;
    }
    const [fileName, content] = files[fmt];
    const fullPath = resolve(out, fileName);
    writeFileSync(fullPath, content);
    console.log(`Создан: ${fullPath}`);
  }

  if (formats.includes('matrix')) {
    const rgbPath = resolve(out, 'matrix-rgb.json');
    writeFileSync(rgbPath, JSON.stringify(matrixRgb));
    console.log(`Создан: ${rgbPath}`);
  }

  // Краткая статистика
  const unique = new Set(pixels.map((p) => p.hex));
  console.log(`\nУникальных цветов: ${unique.size}`);
  console.log(`Файлы сохранены в: ${out}`);
  console.log(`\nПример записи (пиксель): ${JSON.stringify(pixels[0])}`);
}

main();
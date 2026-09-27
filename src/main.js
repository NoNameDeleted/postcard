import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* =============================== Константы =============================== */

const MAX_IMAGE_SIZE = 128;  // максимальная сторона загружаемой PNG (px)
const BASE_WIDTH = 32;       // базовая ширина открытки в мировых единицах

const FLAT = Math.PI / 2;    // плитка лежит горизонтально
const STAND = 0;             // плитка стоит вертикально

const WHITE = '#FFFFFF';     // белый пиксель → плитка стоит
const BLACK = '#000000';     // чёрный пиксель → плитка лежит

/* ================================= Сцена ================================= */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(3, 3, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.getElementById('app').appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 10, 7);
scene.add(sun);

/* =========================== Сетка плиток ================================ */

// Все плитки текущей открытки живут в одной группе. При загрузке новой
// картинки группа очищается, поэтому старые плитки не влияют на новые.
const postcardGroup = new THREE.Group();
scene.add(postcardGroup);

// cells[x][y]:
//   y ∈ [1..wallHeight]                — вертикальная стенка (вдоль оси Y)
//   y ∈ [wallHeight+1..2·wallHeight]   — горизонтальная полка (вдоль оси Z)
// Размеры сетки задаются под конкретную картинку при её загрузке:
//   ширина сетки  = img.width / 2  (картинка поделена пополам слева/справа)
//   wallHeight    = img.height / 2 (верхняя половина → стенка, нижняя → полка)
let cells = [];

const tileGeo = new THREE.PlaneGeometry(0.98, 0.98);
// У каждой плитки собственный материал: смена цвета одного меша
// не должна перекрашивать остальные.
const makeTileMaterial = () =>
  new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide });

/**
 * Полностью удаляет плитки предыдущей открытки из сцены:
 * убирает меши из группы и освобождает их материалы.
 */
function clearTiles() {
  for (const child of [...postcardGroup.children]) {
    postcardGroup.remove(child);
    child.material.dispose();
  }
  cells = [];
}

/**
 * Строит сетку плиток под размеры загруженной картинки.
 * Предыдущая открытка перед этим удаляется (см. clearTiles).
 *
 * @param {number} width      число колонок (img.width / 2)
 * @param {number} wallHeight высота стенки и глубина полки (img.height / 2)
 */
function buildGrid(width, wallHeight) {
  clearTiles();

  cells = Array.from({ length: width }, () => new Array(2 * wallHeight + 1));

  for (let x = 0; x < width; x++) {
    for (let i = wallHeight; i > 0; i--) {
      const wall = new THREE.Mesh(tileGeo, makeTileMaterial());
      wall.position.set(x, i - 0.5, 0);
      cells[x][i] = wall;
      postcardGroup.add(wall);

      const shelf = new THREE.Mesh(tileGeo, makeTileMaterial());
      shelf.rotation.x = FLAT;
      shelf.position.set(x, 0, i - 0.5);
      cells[x][i + wallHeight] = shelf;
      postcardGroup.add(shelf);
    }
  }

  // Открытка любой ширины приводится к одной и той же мировой ширине
  // (равномерный масштаб, пропорции плиток сохраняются), поэтому камера
  // не «улетает» при смене размера картинки.
  postcardGroup.scale.setScalar(BASE_WIDTH / width);
}

/* ============================ Анимация и UI ============================== */

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

window.addEventListener('resize', onResize);
animate();

/* ======================== Чтение пикселей PNG ============================ */

// Таблица из 256 готовых hex-пар — быстрее повторных toString/padStart.
const hex = Array.from({ length: 256 }, (_, n) =>
  n.toString(16).padStart(2, '0').toUpperCase()
);
const rgbToHex = (r, g, b) => `#${hex[r]}${hex[g]}${hex[b]}`;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать изображение')); };
    img.src = url;
  });
}

function validateImage(file, img) {
  if (file.type !== 'image/png')
    throw new Error('Можно загружать только PNG-картинки');
  if (img.width > MAX_IMAGE_SIZE || img.height > MAX_IMAGE_SIZE)
    throw new Error(
      `Размер не должен превышать ${MAX_IMAGE_SIZE}×${MAX_IMAGE_SIZE}px (получено ${img.width}×${img.height})`
    );
  if (img.width % 2 || img.height % 2)
    throw new Error(`Ширина и высота должны быть чётными (получено ${img.width}×${img.height})`);
  return true;
}

/**
 * Матрицы пикселей обеих половин: half[x][y] -> "#RRGGBB",
 * x ∈ [0, width/2), y ∈ [0, height). Canvas читается один раз.
 */
function buildPixelMatrices(img) {
  const { width, height } = img;
  const halfWidth = width / 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, width, height);
  const left = [];
  const right = [];

  for (let x = 0; x < halfWidth; x++) {
    const l = new Array(height);
    const r = new Array(height);
    for (let y = 0; y < height; y++) {
      const i = (width * y + x) * 4;          // левый столбец
      const j = i + halfWidth * 4;            // правый столбец
      l[y] = rgbToHex(data[i], data[i + 1], data[i + 2]);
      r[y] = rgbToHex(data[j], data[j + 1], data[j + 2]);
    }
    left.push(l);
    right.push(r);
  }
  return { left, right };
}

/* ======================= Применение пикселей к плиткам ==================== */

const isWhite = (c) => c === WHITE;
const isBlack = (c) => c === BLACK;

/**
 * Верхняя половина картинки → стенка, нижняя → полка.
 * Повороты и позиции задаёт левая половина (pixels), цвета — правая (colors).
 *
 * @param {number} wallHeight высота стенки / глубина полки (img.height / 2)
 */
function applyPixelProperties(pixels, colors, wallHeight) {
  for (let x = 0; x < pixels.length; x++) {
    const column = pixels[x];
    const stacked = applyWallColumn(x, column, colors, wallHeight);
    applyShelfColumn(x, column, colors, stacked, wallHeight);
  }
}

// Стенка (y < wallHeight): пиксель y ↔ cells[x][wallHeight - y] — индекс
// инвертируется, т.к. плитки создавались сверху вниз, а пиксели читаются
// сверху вниз. Чёрные плитки укладываются вперёд друг на друга (счётчик stacked).
function applyWallColumn(x, column, colors, wallHeight) {
  let stacked = 0;
  for (let y = 0; y < Math.min(wallHeight, column.length); y++) {
    const flat = !isWhite(column[y]);
    if (isBlack(column[y])) stacked++;

    const cell = cells[x][wallHeight - y];
    cell.rotation.x = flat ? FLAT : STAND;
    cell.position.z = stacked - (flat ? 0.5 : 0);
    cell.position.y += stacked - (flat ? 0.5 : 0);
    setCellColor(cell, colors, x, y);
  }
  return stacked;
}

// Полка (y >= wallHeight): пиксель y ↔ cells[x][y + 1]. Счётчик stacked
// продолжается из стенки, поэтому плитки полки «выдвигаются» из-под неё.
// Затем плитки поднимаются на число белых пикселей ниже них (обход снизу вверх).
function applyShelfColumn(x, column, colors, stacked, wallHeight) {
  for (let y = wallHeight; y < column.length; y++) {
    const flat = !isWhite(column[y]);
    if (isBlack(column[y])) stacked++;

    const cell = cells[x][y + 1];
    cell.rotation.x = flat ? FLAT : STAND;
    cell.position.z = stacked - (flat ? 0.5 : 0);
    setCellColor(cell, colors, x, y);
  }

  let lifted = 0;
  for (let y = column.length; y >= column.length / 2; y--) {
    if (isWhite(column[y])) lifted++;
    const cell = cells[x][y + 1];
    if (!cell) continue;
    cell.position.y += lifted;
    if (cell.rotation.x === STAND) cell.position.y -= 0.5;
  }
}

function setCellColor(cell, colors, x, y) {
  const color = colors[x]?.[y];
  if (color) cell.material.color.set(color);
}

/* ========================== Отладка и загрузка =========================== */

const fileInput = document.getElementById('file-input');
const statusEl = document.getElementById('upload-status');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

fileInput.addEventListener('change', async ({ target }) => {
  const [file] = target.files;
  fileInput.value = '';
  if (!file) return;

  try {
    const img = await loadImage(file);
    validateImage(file, img); // бросает исключение при несоответствии

    const { left, right } = buildPixelMatrices(img);

    // Сетка плиток строится под размеры именно этой картинки:
    // ширина = img.width / 2, высота стенки/полки = img.height / 2.
    const gridWidth = img.width / 2;
    const wallHeight = img.height / 2;
    buildGrid(gridWidth, wallHeight);

    // для отладки: pixels[x][y] → hex-цвет пикселя
    window.pixels = left;

    applyPixelProperties(left, right, wallHeight);

    setStatus(
      `OK: ${img.width}×${img.height} → сетка ${gridWidth} колонок × ${img.height} плиток (стенка ${wallHeight}, полка ${wallHeight}).`
    );
  } catch (error) {
    setStatus(`Ошибка: ${error.message}`, true);
    console.error('Загрузка PNG:', error.message);
  }
});
'use strict';

import { createPixelBufferFromData } from './pipeline.js';

// ═══════════════════════════════════════════
// PROCEDURAL TARGET GENERATORS
// ═══════════════════════════════════════════

/**
 * @description Generates a concentric circles pattern.
 * @param {number} size - Square dimension
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function generateCircles(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  const cx = size / 2;
  const cy = size / 2;
  const ringWidth = Math.max(1, Math.floor(size / 16));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      const ring = Math.floor(dist / ringWidth);
      const bright = ring % 2 === 0 ? 200 : 40;
      ctx.fillStyle = 'rgb(' + bright + ',' + bright + ',' + (bright + 20) + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  return createPixelBufferFromData(imageData.data, size, size);
}

/**
 * @description Generates a diagonal gradient pattern.
 * @param {number} size - Square dimension
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function generateDiagonalGradient(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  const maxDist = (size - 1) * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / maxDist;
      const r = Math.floor(t * 180 + 30);
      const g = Math.floor(t * 80 + 10);
      const b = Math.floor(t * 200 + 40);
      ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  return createPixelBufferFromData(imageData.data, size, size);
}

/**
 * @description Generates a checkerboard pattern.
 * @param {number} size - Square dimension
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function generateCheckerboard(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  const cellSize = Math.max(1, Math.floor(size / 8));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);
      const bright = (cx + cy) % 2 === 0 ? 220 : 20;
      ctx.fillStyle = 'rgb(' + bright + ',' + bright + ',' + bright + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  return createPixelBufferFromData(imageData.data, size, size);
}

/**
 * @description Generates an Archimedean spiral pattern.
 * @param {number} size - Square dimension
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function generateSpiral(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.48;
  const turns = 8;
  const totalSteps = Math.floor(size * turns * 2);

  ctx.strokeStyle = '#c0c0d0';
  ctx.lineWidth = Math.max(1, size / 128);
  ctx.beginPath();

  for (let i = 0; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const angle = t * turns * 2 * Math.PI;
    const r = t * maxRadius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const imageData = ctx.getImageData(0, 0, size, size);
  return createPixelBufferFromData(imageData.data, size, size);
}

/**
 * @description Generates a radial burst pattern.
 * @param {number} size - Square dimension
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function generateRadialBurst(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');

  ctx.fillStyle = '#0a0a0c';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const rays = 24;
  const maxR = size * 0.7;

  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * 2 * Math.PI;
    const bright = 140 + Math.floor(Math.random() * 80);
    ctx.strokeStyle = 'rgb(' + bright + ',' + (bright - 40) + ',' + (bright + 20) + ')';
    ctx.lineWidth = Math.max(1, size / 64);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
    ctx.stroke();
  }

  const imageData = ctx.getImageData(0, 0, size, size);
  return createPixelBufferFromData(imageData.data, size, size);
}

/**
 * @description Array of procedural target generators.
 * @type {Array<{ name: string, fn: function(number): object }>}
 */
export const PROCEDURAL_GENERATORS = [
  { name: 'Concentric Circles', fn: generateCircles },
  { name: 'Diagonal Gradient', fn: generateDiagonalGradient },
  { name: 'Checkerboard', fn: generateCheckerboard },
  { name: 'Spiral', fn: generateSpiral },
  { name: 'Radial Burst', fn: generateRadialBurst }
];

/**
 * @description Generates a random procedural target at the given resolution.
 * @param {number} size - Square dimension
 * @returns {{ width: number, height: number, data: Uint8ClampedArray, count: number }}
 */
export function generateRandomTarget(size) {
  const idx = Math.floor(Math.random() * PROCEDURAL_GENERATORS.length);
  return PROCEDURAL_GENERATORS[idx].fn(size);
}

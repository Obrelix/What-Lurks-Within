'use strict';

// ═══════════════════════════════════════════
// TESTING FLAG
// ═══════════════════════════════════════════
export const TESTING = location.search.includes('test=true');

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════
export const CONFIG = {
  // Colour palette (mirrors CSS custom properties for JS use)
  COLOR_BG_PRIMARY: '#0a0a0c',
  COLOR_BG_SECONDARY: '#111116',
  COLOR_TEXT_PRIMARY: '#e0dfe4',
  COLOR_TEXT_ACCENT: '#7f5af0',
  COLOR_GLITCH_R: '#ff0040',
  COLOR_GLITCH_C: '#00f0ff',
  COLOR_DANGER: '#e53170',

  // Resolutions
  RESOLUTION_LOW: 256,
  RESOLUTION_MID: 512,
  RESOLUTION_HIGH: 768,
  DEFAULT_RESOLUTION: 512,

  // Noise canvas
  NOISE_SCALE: 2,
  NOISE_FPS: 12,

  // Animation
  TWEEN_DURATION_MS: 1500,
  TWEEN_SPEED_VARIANCE: 0.4,
  ARC_MAGNITUDE: 15,
  PIXEL_FLIGHT_SIZE: 1,
  PIXEL_FLIGHT_BOOST: 20,
  COMPLETION_DELAY_MS: 500,
  TARGET_DURATION_S: 18,

  // Pixel algorithm
  LUMINANCE_BAND_WIDTH: 8,

  // Upload
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,

  // Toast
  TOAST_DURATION_MS: 4000,

  // Procedural target count
  PROCEDURAL_TARGET_COUNT: 5,

  // Dual-canvas layout
  CANVAS_GAP_RATIO: 0.08,
  MAX_INFLIGHT: 20000,

  // Default image matching
  HISTOGRAM_MIN_SCORE: 0.3,
  HISTOGRAM_BINS: 32,
  // Video recording
  VIDEO_FRAMERATE: 60,
  VIDEO_BITRATE: 12000000,
  VIDEO_RENDER_SCALE: 2,
  VIDEO_MIME_PRIORITY: [
    'video/mp4;codecs=avc1.42E01E',
    'video/webm;codecs=vp9',
    'video/webm'
  ],

  // Video buffers
  VIDEO_BUFFER_OPEN_MS: 600,
  VIDEO_BUFFER_CLOSE_MS: 1000,
  VIDEO_BUFFER_SLIDE_MS: 500,

  // Watermark
  WATERMARK_TEXT: 'What Lurks Within',
  WATERMARK_FONT_SIZE_RATIO: 0.03,
  WATERMARK_OPACITY: 0.25,
  WATERMARK_PADDING_RATIO: 0.02,

  DEFAULT_IMAGE_PATHS: [
    'defaultImages/img1.jpg',
    'defaultImages/img2.jpg',
    'defaultImages/img3.jpg',
    'defaultImages/img4.jpg',
    'defaultImages/img5.jpg',
    'defaultImages/img6.jpg',
    'defaultImages/img7.jpg',
    'defaultImages/img8.jpg',
    'defaultImages/img9.jpg',
    'defaultImages/img10.jpg',
    'defaultImages/img11.jpg',
    'defaultImages/img12.jpg',
    'defaultImages/img13.jpg',
    'defaultImages/img14.jpg',
    'defaultImages/img15.png',
    'defaultImages/img16.jpg',
    'defaultImages/img17.jpg',
    'defaultImages/img18.jpg'
  ]
};

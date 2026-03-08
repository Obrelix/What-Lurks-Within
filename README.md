# What Lurks Within

Every photo hides another.

**[Try it live](https://obrelix.github.io/What-Lurks-Within/)**

**What Lurks Within** is a browser-based pixel art experiment that takes every pixel from your uploaded photograph and rearranges them to recreate a completely different image. No pixels are added or removed — only their positions change. You watch the migration happen in real time.

## How It Works

1. **Upload** any photograph
2. **Choose a target** — pick a built-in image, upload your own, or let fate decide
3. **Watch** as every pixel migrates from its original position to its new home
4. **Download** the final image or a video of the full animation

The core algorithm sorts pixels by luminance and hue, then creates a bijective mapping between source and target positions. Pixels with similar brightness in your photo get assigned to matching regions in the target image, producing a recognizable result using only the original colour palette.

## Features

- **Zero dependencies** — pure ES modules, no build system, no bundler, no package manager
- **Real-time animation** — watch up to 589,824 pixels (768x768) migrate at 60fps using typed arrays and `requestAnimationFrame`
- **Multiple animation patterns** — spatial sweep, random scatter, luminance-ordered, or spiral
- **Procedural targets** — concentric circles, diagonal gradient, checkerboard, spiral, and radial burst generators
- **Histogram matching** — "I'm feeling lucky" mode selects the best-matching default image based on your photo's colour distribution
- **CRT aesthetic** — dark theme with scanline overlay, VHS noise canvas, and glitch text animations
- **Downloadable results** — save the final image as PNG or download a WebM video of the full animation (via MediaRecorder + `captureStream`)

## Quick Start

ES modules require a local server — `file://` protocol will not work.

```bash
# Clone the repository
git clone https://github.com/Obrelix/What-Lurks-Within.git
cd What-Lurks-Within

# Start a local server
npx serve . -p 3000
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
index.html                  HTML markup (screens + modals)
css/styles.css              All CSS (dark CRT theme)
js/
  main.js                   Entry point
  config.js                 All constants (CONFIG object)
  state.js                  Mutable app state (APP_STATE singleton)
  utils.js                  Pure functions (luminance, hue, easing)
  events.js                 Event wiring (buttons, drag-and-drop, file inputs)
  state-management.js       Reset, download, retry logic
  ui/                       Screen transitions, toasts, noise overlay, option groups
  image/                    Image pipeline, procedural generators, histogram matching
  algorithm/                Pixel mapping (luminance+hue sort) and animation patterns
  animation/                Animation engine (typed arrays, requestAnimationFrame loop)
  video/                    Video recorder (MediaRecorder + captureStream)
  validation/               Validation suite (loaded via ?test=true)
defaultImages/              15 built-in target images
```

## UI Flow

The app uses a 4-screen state machine:

**Landing** → **Setup** → **Animation** → **Result**

- **Landing** — Title with glitch animation, "Upload Your Photo" CTA, "How It Works" modal
- **Setup** — Source preview, target mode selection, resolution picker (256/512/768), animation pattern picker
- **Animation** — Canvas-based pixel migration with progress bar
- **Result** — Final image, download image/video, try again, start over

## Resolution Options

| Setting | Pixels | Description |
|---------|--------|-------------|
| 256x256 | 65,536 | Fast preview |
| 512x512 | 262,144 | Default balance of quality and speed |
| 768x768 | 589,824 | Maximum detail |

## Validation

The project includes a built-in validation suite. To run it:

```bash
# Start the server
npx serve . -p 3000

# Open in browser with test flag
# http://localhost:3000/?test=true
# Results log to the browser console
```

## Tech Stack

- Vanilla JavaScript (ES modules)
- HTML5 Canvas API + MediaRecorder API
- CSS custom properties + `@keyframes` animations
- Google Fonts (Share Tech Mono)

No frameworks. No transpilation. No npm packages.

## License

[GPL-3.0](LICENSE)
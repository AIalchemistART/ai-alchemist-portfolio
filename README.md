# AI Alchemist Portfolio

Matthew Walker's glass-style AI Alchemist portfolio: five chapter videos and 25 project cards across games, memory agents, small business tools, creative apps, and client/brand builds.

**Live site:** https://ai-alchemist-portfolio.netlify.app

## Stack

Static HTML/CSS/JS. No build step. Videos and screenshots are local assets under `media/` and `assets/`.

## Deploy

- Publish directory: site root (this folder)
- Netlify build: `node tools/stamp-assets.mjs` adds a content hash to CSS and JS links
- Continuous deploys: connected to this GitHub repo when linked

## Notes

- `_preview/` is excluded from git and publish (local QA screenshots only).
- Project metadata lives in `projects.json`.

## Recompress the chapter videos

`tools/compress-videos/compress.mjs` re-encodes clips with ffmpeg for this site. It needs Node 18+ and ffmpeg. There is no npm install.

```bash
node tools/compress-videos/compress.mjs media --out media-compressed
```

Defaults: H.264 (CRF 28, `slow` preset, 2500k max rate), AAC (96 kbps mono, 128 kbps stereo), height capped at 720 with no upscale, and `+faststart` so the moov atom sits at the front of the file. On these chapter videos that is about 10–18 MB per five minutes, depending on how much the picture moves. Check `media-compressed/`, then replace the files in `media/` when you want them on the site. `index.html` and `projects.json` keep the same paths.

ffmpeg is resolved from `--ffmpeg`, then `FFMPEG_PATH`, then `ffmpeg` on `PATH`. On Windows it also looks for `ffmpeg.exe` on `PATH` and in common install folders. `ffmpeg.dll` is the library next to the program; pass `ffmpeg.exe`:

```powershell
$env:FFMPEG_PATH = "C:\path\to\ffmpeg.exe"
node tools/compress-videos/compress.mjs media --out media-compressed
```

`node tools/compress-videos/compress.mjs --help` lists every flag.

#!/usr/bin/env node
/**
 * Compress videos for web delivery with ffmpeg.
 *
 * Defaults: H.264 (CRF 28, max 720p, no upscale), AAC, moov atom at the
 * front (+faststart). No npm dependencies. Requires Node 18+ and ffmpeg.
 *
 *   node tools/compress-videos/compress.mjs media --out media-compressed
 *   node tools/compress-videos/compress.mjs --help
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VIDEO_EXT = new Set([".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi"]);

const HELP = `Compress videos for a portfolio site (H.264 + AAC, faststart).

Usage
  node tools/compress-videos/compress.mjs <file-or-folder>... [options]

Options
  --out, -o <dir>         Output folder (default: compressed)
  --ffmpeg <path>         ffmpeg executable, or a folder that contains it
  --crf <0-51>            x264 quality. Lower is sharper and larger (default: 28)
  --max-height <px>       Cap height. Never upscales (default: 720)
  --maxrate <rate>        Video rate ceiling, e.g. 2500k (default: 2500k).
                          Pass "none" to leave the ceiling off.
  --bufsize <rate>        VBV buffer for --maxrate (default: 5000k)
  --preset <name>         x264 preset (default: slow)
  --audio-bitrate <rate>  AAC bitrate. Default: 96k mono, 128k stereo
  --overwrite             Replace an existing file in the output folder
  --dry-run               Print the ffmpeg command and do not encode
  -h, --help              Show this help

ffmpeg lookup
  1. --ffmpeg
  2. FFMPEG_PATH (executable, or a folder containing ffmpeg / ffmpeg.exe)
  3. ffmpeg on PATH
  4. On Windows, ffmpeg.exe on PATH, then common install locations

  ffmpeg.dll is the library shipped beside the program. Point this tool at
  ffmpeg.exe:

    set FFMPEG_PATH=C:\\path\\to\\ffmpeg.exe
    node tools/compress-videos/compress.mjs media --out media-compressed

Examples
  node tools/compress-videos/compress.mjs media --out media-compressed
  node tools/compress-videos/compress.mjs clip.mp4 --out dist --crf 26
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const inputs = [];
  const opts = {
    out: "compressed",
    ffmpeg: null,
    crf: 28,
    maxHeight: 720,
    maxrate: "2500k",
    bufsize: "5000k",
    preset: "slow",
    audioBitrate: null,
    overwrite: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = () => {
      if (i + 1 >= argv.length) fail(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };

    switch (arg) {
      case "--out":
      case "-o":
        opts.out = take();
        break;
      case "--ffmpeg":
        opts.ffmpeg = take();
        break;
      case "--crf":
        opts.crf = Number(take());
        break;
      case "--max-height":
        opts.maxHeight = Number(take());
        break;
      case "--maxrate":
        opts.maxrate = take();
        break;
      case "--bufsize":
        opts.bufsize = take();
        break;
      case "--preset":
        opts.preset = take();
        break;
      case "--audio-bitrate":
        opts.audioBitrate = take();
        break;
      case "--overwrite":
        opts.overwrite = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      default:
        if (arg.startsWith("-")) fail(`Unknown option ${arg}\n\n${HELP}`);
        inputs.push(arg);
    }
  }

  return { inputs, opts };
}

function findOnPath(name) {
  const locator = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(locator, [name], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const line = result.stdout
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  return line || null;
}

function resolveExplicit(value) {
  if (!value) return null;
  if (!fs.existsSync(value)) return null;
  const stat = fs.statSync(value);
  if (stat.isDirectory()) {
    const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
    const joined = path.join(value, exe);
    return fs.existsSync(joined) ? joined : null;
  }
  return stat.isFile() ? value : null;
}

function windowsFallbacks() {
  if (process.platform !== "win32") return [];
  const local = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  return [
    local && path.join(local, "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
    programFiles && path.join(programFiles, "ffmpeg", "bin", "ffmpeg.exe"),
    programFilesX86 && path.join(programFilesX86, "ffmpeg", "bin", "ffmpeg.exe"),
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
  ].filter(Boolean);
}

function resolveFfmpeg(explicit) {
  if (explicit) {
    const fromFlag = resolveExplicit(explicit);
    if (!fromFlag) {
      fail(
        `ffmpeg was not found at ${explicit}. Pass ffmpeg.exe (ffmpeg.dll is the library beside it).`,
      );
    }
    return fromFlag;
  }

  if (process.env.FFMPEG_PATH) {
    const fromEnv = resolveExplicit(process.env.FFMPEG_PATH);
    if (!fromEnv) {
      fail(
        `FFMPEG_PATH does not point at ffmpeg: ${process.env.FFMPEG_PATH}. Use the path to ffmpeg.exe or a folder that contains it.`,
      );
    }
    return fromEnv;
  }

  const names = process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"];
  for (const name of names) {
    const found = findOnPath(name);
    if (found && fs.existsSync(found)) return found;
  }

  for (const fallback of windowsFallbacks()) {
    if (fs.existsSync(fallback)) return fallback;
  }

  fail(
    "ffmpeg was not found. Install it and add it to PATH, or set FFMPEG_PATH / --ffmpeg to ffmpeg.exe.",
  );
}

function resolveFfprobe(ffmpegPath) {
  const sibling = path.join(
    path.dirname(ffmpegPath),
    process.platform === "win32" ? "ffprobe.exe" : "ffprobe",
  );
  if (fs.existsSync(sibling)) return sibling;
  const names = process.platform === "win32" ? ["ffprobe.exe", "ffprobe"] : ["ffprobe"];
  for (const name of names) {
    const found = findOnPath(name);
    if (found && fs.existsSync(found)) return found;
  }
  return null;
}

function collectInputs(inputs) {
  const files = [];
  for (const input of inputs) {
    if (!fs.existsSync(input)) fail(`Not found: ${input}`);
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      const names = fs.readdirSync(input).sort();
      for (const name of names) {
        const full = path.join(input, name);
        if (!fs.statSync(full).isFile()) continue;
        if (VIDEO_EXT.has(path.extname(name).toLowerCase())) files.push(full);
      }
      continue;
    }
    if (stat.isFile()) files.push(input);
  }
  return files;
}

function probe(ffprobe, file) {
  const result = spawnSync(
    ffprobe,
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
    { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || `ffprobe failed for ${file}`).trim());
  }
  return JSON.parse(result.stdout);
}

function streamByType(info, type) {
  return (info.streams || []).find((stream) => stream.codec_type === type) || null;
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function quoteArg(arg) {
  if (/^[A-Za-z0-9_./:\\,+-]+$/.test(arg)) return arg;
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, {
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function moovIsFirst(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const header = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= size) {
      fs.readSync(fd, header, 0, 16, pos);
      let boxSize = header.readUInt32BE(0);
      const type = header.toString("latin1", 4, 8);
      if (boxSize === 1) {
        boxSize = Number(header.readBigUInt64BE(8));
      } else if (boxSize === 0) {
        boxSize = size - pos;
      }
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (!Number.isFinite(boxSize) || boxSize < 8) return false;
      pos += boxSize;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function replaceFile(tempPath, finalPath) {
  const backup = `${finalPath}.bak`;
  fs.renameSync(finalPath, backup);
  try {
    fs.renameSync(tempPath, finalPath);
    fs.unlinkSync(backup);
  } catch (error) {
    if (fs.existsSync(backup) && !fs.existsSync(finalPath)) {
      fs.renameSync(backup, finalPath);
    }
    throw error;
  }
}

function audioBitrateFor(channels, override) {
  if (override) return override;
  return channels >= 2 ? "128k" : "96k";
}

function buildArgs({ input, output, info, opts }) {
  const video = streamByType(info, "video");
  const audio = streamByType(info, "audio");
  if (!video) throw new Error("no video stream");

  // Cap height and keep the aspect ratio. min(ih) means a shorter source is left alone.
  // The comma is escaped because it also separates filters in the filtergraph.
  const vf = `scale=-2:min(${opts.maxHeight}\\,ih)`;

  const args = ["-y", "-i", input, "-map", "0:v:0"];
  if (audio) args.push("-map", "0:a:0");
  args.push(
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    opts.preset,
    "-crf",
    String(opts.crf),
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
  );
  if (opts.maxrate !== "none") {
    args.push("-maxrate", opts.maxrate, "-bufsize", opts.bufsize);
  }
  if (audio) {
    const channels = Number(audio.channels) || 2;
    args.push("-c:a", "aac", "-b:a", audioBitrateFor(channels, opts.audioBitrate));
  } else {
    args.push("-an");
  }
  args.push("-movflags", "+faststart", "-map_metadata", "0", output);
  return args;
}

async function compressOne({ file, outDir, ffmpeg, ffprobe, opts }) {
  const base = path.basename(file, path.extname(file));
  const finalPath = path.join(outDir, `${base}.mp4`);
  const sameFile = path.resolve(finalPath) === path.resolve(file);
  const beforeBytes = fs.statSync(file).size;

  if (!sameFile && fs.existsSync(finalPath) && !opts.overwrite) {
    console.log(`skip ${finalPath} (exists; pass --overwrite)`);
    return { file, skipped: true, beforeBytes, afterBytes: fs.statSync(finalPath).size };
  }

  if (!ffprobe) throw new Error("ffprobe was not found next to ffmpeg or on PATH");
  const info = probe(ffprobe, file);
  const target = sameFile ? `${finalPath}.partial.mp4` : finalPath;
  const args = buildArgs({ input: file, output: target, info, opts });

  console.log(`\n${path.basename(file)}  ${formatMb(beforeBytes)}`);
  console.log(`  ${[ffmpeg, ...args].map(quoteArg).join(" ")}`);
  if (opts.dryRun) {
    return { file, dryRun: true, beforeBytes, afterBytes: null };
  }

  fs.mkdirSync(outDir, { recursive: true });
  try {
    await runFfmpeg(ffmpeg, args);
    if (sameFile) replaceFile(target, finalPath);
  } catch (error) {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    throw error;
  }

  const afterBytes = fs.statSync(finalPath).size;
  const after = probe(ffprobe, finalPath);
  const video = streamByType(after, "video");
  const audio = streamByType(after, "audio");
  const faststart = moovIsFirst(finalPath);
  const saved = beforeBytes === 0 ? 0 : (1 - afterBytes / beforeBytes) * 100;
  const delta =
    saved >= 0 ? `${saved.toFixed(0)}% smaller` : `${Math.abs(saved).toFixed(0)}% larger`;
  console.log(
    `  -> ${video ? `${video.width}x${video.height}` : "?"}  ${video?.codec_name || "?"} + ${audio?.codec_name || "no audio"}  ${formatMb(afterBytes)}  (${delta})  faststart=${faststart ? "yes" : "no"}`,
  );

  return {
    file: finalPath,
    name: path.basename(finalPath),
    beforeBytes,
    afterBytes,
    width: video?.width,
    height: video?.height,
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    faststart,
    duration: Number(after.format?.duration),
  };
}

function printSummary(rows) {
  const done = rows.filter((row) => row && !row.skipped && !row.dryRun && row.afterBytes != null);
  if (done.length === 0) return;
  console.log("\nFile                          Before     After");
  let before = 0;
  let after = 0;
  for (const row of done) {
    before += row.beforeBytes;
    after += row.afterBytes;
    const name = (row.name || path.basename(row.file)).padEnd(28);
    console.log(`${name}  ${formatMb(row.beforeBytes).padStart(8)}  ${formatMb(row.afterBytes).padStart(8)}`);
  }
  console.log(`${"total".padEnd(28)}  ${formatMb(before).padStart(8)}  ${formatMb(after).padStart(8)}`);
}

async function main() {
  const { inputs, opts } = parseArgs(process.argv.slice(2));
  if (opts.help || inputs.length === 0) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 1);
  }
  if (!Number.isInteger(opts.crf) || opts.crf < 0 || opts.crf > 51) {
    fail("--crf must be an integer from 0 to 51");
  }
  if (!Number.isInteger(opts.maxHeight) || opts.maxHeight < 2) {
    fail("--max-height must be an integer of at least 2");
  }

  const ffmpeg = resolveFfmpeg(opts.ffmpeg);
  const ffprobe = resolveFfprobe(ffmpeg);
  const files = collectInputs(inputs);
  if (files.length === 0) fail("No video files found.");

  const names = new Map();
  for (const file of files) {
    const base = path.basename(file, path.extname(file)).toLowerCase();
    if (names.has(base)) {
      fail(`Two inputs would both write ${base}.mp4:\n  ${names.get(base)}\n  ${file}`);
    }
    names.set(base, file);
  }

  console.log(`ffmpeg: ${ffmpeg}`);
  if (!ffprobe) {
    fail("ffprobe was not found next to ffmpeg or on PATH. Install ffmpeg (it includes ffprobe).");
  }
  console.log(`ffprobe: ${ffprobe}`);

  const rows = [];
  const errors = [];
  for (const file of files) {
    try {
      rows.push(await compressOne({ file, outDir: opts.out, ffmpeg, ffprobe, opts }));
    } catch (error) {
      errors.push({ file, message: error.message });
      console.error(`failed ${file}: ${error.message}`);
    }
  }

  printSummary(rows);
  if (errors.length > 0) {
    console.error(`\n${errors.length} file(s) failed.`);
    process.exit(1);
  }
}

main().catch((error) => fail(error.stack || error.message));

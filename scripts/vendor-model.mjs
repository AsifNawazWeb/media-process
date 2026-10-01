#!/usr/bin/env node
/**
 * Vendor @imgly/background-removal model assets into public/imgly.
 *
 * The data tarball (matching the installed @imgly/background-removal version)
 * ships every resource sharded into byte-range chunks: `resources.json` maps
 * each logical resource (e.g. /models/isnet_fp16) to an ordered list of chunk
 * shard files named by their sha256 hash. The library fetches shards itself and
 * assembles the blob in the browser — so we simply spread the shard files into
 * public/imgly and prune the resources we do not serve (the ~176MB full isnet).
 *
 * Usage: npm run setup:model   (or: node scripts/vendor-model.mjs [--force])
 */
import { existsSync, mkdirSync, readdirSync, createWriteStream, statSync } from "node:fs";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public", "imgly");
const tmpDir = path.join(root, ".vendor-tmp");
const force = process.argv.includes("--force");

const { version } = JSON.parse(
  await readFile(path.join(root, "node_modules", "@imgly/background-removal", "package.json"), "utf8")
);
const TARBALL_URL = `https://staticimgly.com/@imgly/background-removal-data/${version}/package.tgz`;

/** Resources we self-host (the ~176MB full `isnet` model is intentionally omitted). */
const KEEP_RESOURCES = ["/models/isnet_fp16", "/models/isnet_quint8"];

const log = (msg) => process.stdout.write(`${msg}\n`);

if (!force) {
  const stampPath = path.join(publicDir, ".vendored-version");
  if (existsSync(stampPath)) {
    const stamp = JSON.parse(await readFile(stampPath, "utf8"));
    if (stamp.version === version) {
      log(`Assets for ${version} already vendored in public/imgly — nothing to do (use --force to re-download).`);
      process.exit(0);
    }
    log(`Vendored version ${stamp.version} != package version ${version} — re-vendoring...`);
  }
}

/** Download with progress reporting. */
async function fetchTarball(url, dest) {
  log(`Fetching ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get("content-length") || 0);
  let received = 0;
  let lastPct = -1;
  const progress = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      const pct = Math.floor((received / total) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        process.stdout.write(`\r  ${pct}% (${(received / 1e6).toFixed(0)}MB / ${(total / 1e6).toFixed(0)}MB)`);
      }
      cb(null, chunk);
    },
  });
  await streamPipeline(Readable.fromWeb(res.body), progress, createWriteStream(dest));
  process.stdout.write("\n");
}

/** Extract .tgz via system tar. */
function extract(tarball, destDir) {
  mkdirSync(destDir, { recursive: true });
  const { status } = spawnSync("tar", ["-xzf", tarball, "-C", destDir], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (status !== 0) throw new Error("tar extraction failed (is tar installed?)");
}

async function main() {
  mkdirSync(tmpDir, { recursive: true });
  const tarball = path.join(tmpDir, "bg-removal-data.tgz");
  try {
    await fetchTarball(TARBALL_URL, tarball);

    const extractDir = path.join(tmpDir, "extracted");
    await rm(extractDir, { recursive: true, force: true });
    extract(tarball, extractDir);

    const distDir = path.join(extractDir, "package", "dist");
    if (!existsSync(distDir)) throw new Error(`Unexpected tarball layout: no package/dist under ${extractDir}`);

    const resources = JSON.parse(await readFile(path.join(distDir, "resources.json"), "utf8"));

    // Collect shard files for kept resources and validate their byte ranges.
    const shardNames = new Set();
    for (const key of Object.keys(resources)) {
      const wanted = KEEP_RESOURCES.includes(key) || key.startsWith("/onnxruntime-web/");
      if (!wanted) continue;
      const entry = resources[key];
      if (!entry) throw new Error(`Resource ${key} not found in resources.json`);
      let sum = 0;
      for (const chunk of entry.chunks) {
        shardNames.add(chunk.name);
        sum += chunk.offsets[1] - chunk.offsets[0];
      }
      if (sum !== entry.size) {
        throw new Error(`Chunk sizes for ${key} sum to ${sum} but entry.size is ${entry.size}`);
      }
    }

    await rm(publicDir, { recursive: true, force: true });
    mkdirSync(publicDir, { recursive: true });
    await cp(path.join(distDir, "resources.json"), path.join(publicDir, "resources.json"));
    const licenseSrc = path.join(extractDir, "package", "LICENSE.md");
    if (existsSync(licenseSrc)) await cp(licenseSrc, path.join(publicDir, "LICENSE.md"));
    const thirdPartySrc = path.join(extractDir, "package", "ThirdPartyLicenses.json");
    if (existsSync(thirdPartySrc)) await cp(thirdPartySrc, path.join(publicDir, "ThirdPartyLicenses.json"));

    let copied = 0;
    let totalBytes = 0;
    for (const name of shardNames) {
      const src = path.join(distDir, name);
      if (!existsSync(src)) throw new Error(`Missing shard file in tarball: ${name}`);
      await cp(src, path.join(publicDir, name));
      copied++;
      totalBytes += statSync(src).size;
    }
    totalBytes += statSync(path.join(publicDir, "resources.json")).size;

    await writeFile(
      path.join(publicDir, ".vendored-version"),
      JSON.stringify({ version, vendoredAt: new Date().toISOString(), resources: KEEP_RESOURCES }, null, 2) + "\n"
    );

    const mb = (n) => (n / 1e6).toFixed(1);
    log(`\nVendored ${copied} shard files + resources.json → public/imgly (${mb(totalBytes)}MB)`);
    for (const key of KEEP_RESOURCES) log(`  ✓ ${key} (${mb(resources[key].size)}MB)`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

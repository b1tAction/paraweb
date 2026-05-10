import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [, , releaseIdInput] = process.argv;
const releaseId = releaseIdInput?.trim();

if (!releaseId) {
  console.error('Usage: node scripts/write-web-version.mjs <release_id>');
  process.exit(1);
}

const projectRoot = process.cwd();
const publicAssetsDir = path.join(projectRoot, 'public', 'assets');
const distDir = path.join(projectRoot, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const outputPath = path.join(distDir, 'version.json');

const BUILD_ASSET_EXTENSIONS = new Set(['.js', '.css']);

async function collectFiles(rootDir, toManifestPath, filter = () => true) {
  const results = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!filter(fullPath)) continue;

      results.push(toManifestPath(fullPath));
    }
  }

  await walk(rootDir);
  return results.sort((left, right) => left.localeCompare(right));
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

const publicAssets = await collectFiles(publicAssetsDir, (filePath) => {
  const relativePath = path.relative(path.join(projectRoot, 'public'), filePath);
  return toPosixPath(relativePath);
});

const buildAssets = await collectFiles(
  distAssetsDir,
  (filePath) => {
    const relativePath = path.relative(distDir, filePath);
    return toPosixPath(relativePath);
  },
  (filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    return BUILD_ASSET_EXTENSIONS.has(extension);
  },
);

const manifest = {
  release_id: releaseId,
  build_time: new Date().toISOString(),
  base_path: process.env.VITE_BASE_PATH || './',
  public_assets: publicAssets,
  build_assets: buildAssets,
};

await stat(distDir);
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${path.relative(projectRoot, outputPath)} with ${publicAssets.length} public assets and ${buildAssets.length} build assets.`);

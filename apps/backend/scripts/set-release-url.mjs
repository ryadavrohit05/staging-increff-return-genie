/**
 * Register a desktop installer that is hosted EXTERNALLY (e.g. GitHub Releases)
 * instead of Supabase Storage. The /app/download endpoint returns the URL
 * directly when installerKey is an http(s) URL, so no Storage space is used.
 *
 *   node scripts/set-release-url.mjs <version> <downloadUrl> [fileName] [minSupported]
 *
 * Example:
 *   node scripts/set-release-url.mjs 0.1.0 \
 *     https://github.com/rohityadav-increff/increff-return-genie-2/releases/download/v0.1.0/ReturnGenie-Setup-0.1.0.exe \
 *     ReturnGenie-Setup-0.1.0.exe true
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const [version, url, fileNameArg, minSupportedArg] = process.argv.slice(2);
if (!version || !url) {
  console.error('usage: node scripts/set-release-url.mjs <version> <downloadUrl> [fileName] [minSupported]');
  process.exit(1);
}
if (!/^https?:\/\//.test(url)) {
  console.error('downloadUrl must be an http(s) URL');
  process.exit(1);
}

const fileName = fileNameArg || url.split('/').pop() || `ReturnGenie-Setup-${version}.exe`;
const minSupported = minSupportedArg === 'true';

// Resolve the real installer size from the URL (follows the GitHub redirect) so
// the portal shows accurate size + a fresh release date — not stale metadata
// from a previous upload.
let sizeBytes = null;
try {
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  const len = head.headers.get('content-length');
  if (len) sizeBytes = parseInt(len, 10);
} catch {
  /* leave null; portal just won't show a size */
}

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

const fields = {
  channel: 'stable',
  minSupported,
  installerKey: url, // an external URL — returned as-is by /app/download
  installerName: fileName,
  installerSize: sizeBytes,
  releasedAt: new Date(),
};
const row = await prisma.appVersion.upsert({
  where: { version },
  create: { version, ...fields },
  update: fields,
});

console.log('Registered release:', row.version, '→', url);
console.log('Size:', sizeBytes ? (sizeBytes / 1048576).toFixed(1) + ' MB' : 'unknown');
console.log('Clients will now get this from the portal Download page.');
await prisma.$disconnect();

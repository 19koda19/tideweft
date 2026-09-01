'use strict';

const fs = require('node:fs/promises');
const fsConstants = require('node:fs').constants;
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { listPackage } = require('@electron/asar');

const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release');
const resultPrefix = 'TIDEWEFT_SMOKE_RESULT ';
const ALLOWED_ASAR_ENTRY = /^\/(?:package\.json|electron|electron\/main\.cjs|dist(?:\/.*)?)$/u;
const SECRET_LIKE_ASAR_ENTRY = /(?:^|\/)(?:\.env(?:\.|$)|\.npmrc$|artifacts(?:\/|$)|.*(?:secret|credential|private[-_.]?key).*)/iu;

function parseArguments(argv) {
  let executable = process.env.TIDEWEFT_PACKAGED_EXECUTABLE || '';
  let screenshot = path.join(projectRoot, 'artifacts', 'electron-smoke.png');
  let titleScreenshot = path.join(projectRoot, 'artifacts', 'electron-title-smoke.png');
  let mobileScreenshot = path.join(projectRoot, 'artifacts', 'electron-mobile-smoke.png');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--no-screenshot') {
      screenshot = '';
      titleScreenshot = '';
      mobileScreenshot = '';
    } else if (argument === '--executable') {
      executable = argv[index + 1] || '';
      index += 1;
    } else if (argument.startsWith('--executable=')) {
      executable = argument.slice('--executable='.length);
    } else if (argument === '--screenshot') {
      screenshot = argv[index + 1] || '';
      index += 1;
    } else if (argument.startsWith('--screenshot=')) {
      screenshot = argument.slice('--screenshot='.length);
    } else if (argument === '--title-screenshot') {
      titleScreenshot = argv[index + 1] || '';
      index += 1;
    } else if (argument.startsWith('--title-screenshot=')) {
      titleScreenshot = argument.slice('--title-screenshot='.length);
    } else if (argument === '--mobile-screenshot') {
      mobileScreenshot = argv[index + 1] || '';
      index += 1;
    } else if (argument.startsWith('--mobile-screenshot=')) {
      mobileScreenshot = argument.slice('--mobile-screenshot='.length);
    } else {
      throw new Error(`Unknown desktop smoke argument: ${argument}`);
    }
  }

  return {
    executable: executable ? path.resolve(executable) : '',
    screenshot: screenshot ? path.resolve(screenshot) : '',
    titleScreenshot: titleScreenshot ? path.resolve(titleScreenshot) : '',
    mobileScreenshot: mobileScreenshot ? path.resolve(mobileScreenshot) : '',
  };
}

async function directoriesAt(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(directory, entry.name));
}

async function filesAt(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(directory, entry.name));
}

async function packagedExecutable() {
  let packageDirectories;
  try {
    packageDirectories = await directoriesAt(releaseRoot);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('No release directory exists. Run `npm run package:desktop` first.');
    }
    throw error;
  }

  const platformMarker = `-${process.platform}-${process.arch}`;
  const matchingDirectories = packageDirectories.filter((directory) => path.basename(directory).includes(platformMarker));
  const candidates = matchingDirectories.length > 0 ? matchingDirectories : packageDirectories;

  if (process.platform === 'darwin') {
    for (const directory of candidates) {
      const appBundles = (await directoriesAt(directory)).filter((candidate) => candidate.endsWith('.app'));
      for (const appBundle of appBundles) {
        const macOSDirectory = path.join(appBundle, 'Contents', 'MacOS');
        try {
          const executables = await filesAt(macOSDirectory);
          const preferredName = path.basename(appBundle, '.app').toLowerCase();
          const preferred = executables.find(
            (candidate) => path.basename(candidate).toLowerCase() === preferredName,
          );
          if (preferred) return preferred;
          if (executables[0]) return executables[0];
        } catch (error) {
          if (!error || error.code !== 'ENOENT') throw error;
        }
      }
    }
  }

  if (process.platform === 'win32') {
    for (const directory of candidates) {
      const executables = (await filesAt(directory)).filter(
        (candidate) => candidate.toLowerCase().endsWith('.exe') && !candidate.toLowerCase().includes('helper'),
      );
      if (executables[0]) return executables[0];
    }
  }

  for (const directory of candidates) {
    const files = await filesAt(directory);
    for (const candidate of files) {
      try {
        await fs.access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Libraries and data files are intentionally skipped.
      }
    }
  }

  throw new Error(
    `Could not locate a packaged ${process.platform}-${process.arch} executable under ${releaseRoot}. ` +
      'Run `npm run package:desktop` first or pass --executable.',
  );
}

function packagedAsarPath(executable) {
  return process.platform === 'darwin'
    ? path.resolve(path.dirname(executable), '..', 'Resources', 'app.asar')
    : path.join(path.dirname(executable), 'resources', 'app.asar');
}

async function verifyPackagedManifest(executable) {
  const asarPath = packagedAsarPath(executable);
  const entries = listPackage(asarPath);
  const unexpected = entries.filter((entry) => !ALLOWED_ASAR_ENTRY.test(entry));
  const secretLike = entries.filter((entry) => SECRET_LIKE_ASAR_ENTRY.test(entry));
  const required = ['/package.json', '/electron/main.cjs', '/dist/index.html'];
  const missing = required.filter((entry) => !entries.includes(entry));
  if (unexpected.length > 0 || secretLike.length > 0 || missing.length > 0) {
    throw new Error(
      `Unsafe packaged ASAR manifest: ${JSON.stringify({
        missing,
        unexpected: unexpected.slice(0, 20),
        secretLike: secretLike.slice(0, 20),
      })}`,
    );
  }
  const archive = await fs.stat(asarPath);
  return { asarPath, entries: entries.length, bytes: archive.size };
}

function parseSmokeResult(output) {
  const lines = output.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line || !line.startsWith(resultPrefix)) continue;
    try {
      return JSON.parse(line.slice(resultPrefix.length));
    } catch (error) {
      throw new Error(`The packaged app returned malformed smoke JSON: ${error.message}`);
    }
  }
  return null;
}

async function runPackagedApp(
  executable,
  screenshot,
  titleScreenshot,
  mobileScreenshot,
  userDataDirectory,
) {
  const child = spawn(executable, ['--tideweft-smoke'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      TIDEWEFT_SMOKE: '1',
      TIDEWEFT_SMOKE_TIMEOUT_MS: '30000',
      TIDEWEFT_SMOKE_USER_DATA: userDataDirectory,
      ...(screenshot ? { TIDEWEFT_SMOKE_SCREENSHOT: screenshot } : {}),
      ...(titleScreenshot ? { TIDEWEFT_SMOKE_TITLE_SCREENSHOT: titleScreenshot } : {}),
      ...(mobileScreenshot ? { TIDEWEFT_SMOKE_MOBILE_SCREENSHOT: mobileScreenshot } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
    process.stderr.write(chunk);
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, 45_000);

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timeout);

  if (timedOut) throw new Error('The packaged desktop smoke test exceeded 45 seconds.');
  const payload = parseSmokeResult(output);
  if (!payload) {
    throw new Error(
      `The packaged app exited without a smoke result (code ${String(result.code)}, signal ${String(result.signal)}).`,
    );
  }
  if (result.code !== 0 || payload.ok !== true) {
    throw new Error(`Packaged desktop verification failed: ${JSON.stringify(payload)}`);
  }

  if (screenshot) {
    const screenshotStat = await fs.stat(screenshot);
    if (!screenshotStat.isFile() || screenshotStat.size < 1_024) {
      throw new Error(`Smoke screenshot is missing or too small: ${screenshot}`);
    }
  }
  if (titleScreenshot) {
    const titleScreenshotStat = await fs.stat(titleScreenshot);
    if (!titleScreenshotStat.isFile() || titleScreenshotStat.size < 1_024) {
      throw new Error(`Title smoke screenshot is missing or too small: ${titleScreenshot}`);
    }
  }
  if (mobileScreenshot) {
    const mobileScreenshotStat = await fs.stat(mobileScreenshot);
    if (!mobileScreenshotStat.isFile() || mobileScreenshotStat.size < 1_024) {
      throw new Error(`Mobile smoke screenshot is missing or too small: ${mobileScreenshot}`);
    }
  }

  return payload;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const executable = options.executable || (await packagedExecutable());
  await fs.access(executable, fsConstants.X_OK);
  const manifest = await verifyPackagedManifest(executable);
  const userDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tideweft-electron-smoke-'));

  try {
    // Never let a screenshot from an earlier run masquerade as current evidence.
    if (options.screenshot) await fs.rm(options.screenshot, { force: true });
    if (options.titleScreenshot) await fs.rm(options.titleScreenshot, { force: true });
    if (options.mobileScreenshot) await fs.rm(options.mobileScreenshot, { force: true });
    process.stdout.write(
      `Verifying packaged desktop app: ${executable}\n` +
      `Verified runtime-only ASAR: ${manifest.entries} entries, ${manifest.bytes} bytes\n`,
    );
    const result = await runPackagedApp(
      executable,
      options.screenshot,
      options.titleScreenshot,
      options.mobileScreenshot,
      userDataDirectory,
    );
    process.stdout.write(
      `Packaged desktop smoke passed at tick ${String(result.world.tick)}` +
        (result.screenshot
          ? `; world screenshot ${result.screenshot.bytes} bytes` +
            (result.mobileScreenshot ? `; mobile screenshot ${result.mobileScreenshot.bytes} bytes` : '') +
            (result.titleScreenshot ? `; title screenshot ${result.titleScreenshot.bytes} bytes.\n` : '.\n')
          : '.\n'),
    );
  } finally {
    await fs.rm(userDataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`Desktop smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});

'use strict';

const fs = require('node:fs/promises');
const fsConstants = require('node:fs').constants;
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release');
const resultPrefix = 'TIDEWEFT_SMOKE_RESULT ';

function parseArguments(argv) {
  let executable = process.env.TIDEWEFT_PACKAGED_EXECUTABLE || '';
  let screenshot = path.join(projectRoot, 'artifacts', 'electron-smoke.png');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--no-screenshot') {
      screenshot = '';
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
    } else {
      throw new Error(`Unknown desktop smoke argument: ${argument}`);
    }
  }

  return {
    executable: executable ? path.resolve(executable) : '',
    screenshot: screenshot ? path.resolve(screenshot) : '',
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

async function runPackagedApp(executable, screenshot, userDataDirectory) {
  const child = spawn(executable, ['--tideweft-smoke'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      TIDEWEFT_SMOKE: '1',
      TIDEWEFT_SMOKE_TIMEOUT_MS: '30000',
      TIDEWEFT_SMOKE_USER_DATA: userDataDirectory,
      ...(screenshot ? { TIDEWEFT_SMOKE_SCREENSHOT: screenshot } : {}),
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

  return payload;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const executable = options.executable || (await packagedExecutable());
  await fs.access(executable, fsConstants.X_OK);
  const userDataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'tideweft-electron-smoke-'));

  try {
    // Never let a screenshot from an earlier run masquerade as current evidence.
    if (options.screenshot) await fs.rm(options.screenshot, { force: true });
    process.stdout.write(`Verifying packaged desktop app: ${executable}\n`);
    const result = await runPackagedApp(executable, options.screenshot, userDataDirectory);
    process.stdout.write(
      `Packaged desktop smoke passed at tick ${String(result.world.tick)}` +
        (result.screenshot ? `; screenshot ${result.screenshot.bytes} bytes.\n` : '.\n'),
    );
  } finally {
    await fs.rm(userDataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`Desktop smoke failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});

'use strict';

const { spawn } = require('node:child_process');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

function runNpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    const npmCliPath = process.env.npm_execpath;
    const executable = npmCliPath
      ? process.execPath
      : process.platform === 'win32'
        ? 'npm.cmd'
        : 'npm';
    const args = npmCliPath
      ? [npmCliPath, 'run', scriptName]
      : ['run', scriptName];
    const child = spawn(executable, args, {
      cwd: __dirname,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal === null ? `exit code ${code}` : `signal ${signal}`;
      reject(new Error(`npm run ${scriptName} failed with ${reason}`));
    });
  });
}

module.exports = {
  outDir: 'release',
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      config: {},
    },
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      // @electron/fuses 1.8 can name the first eight V1 fuses. Electron 44
      // contains a later ninth fuse, so strict wire-length validation would
      // reject an otherwise valid package until the pinned API is upgraded.
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // The stock Electron distribution ships the shared snapshot. Requiring a
      // browser-process-specific snapshot makes the packaged app abort before
      // main unless a custom snapshot is bundled.
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
  hooks: {
    prePackage: async () => runNpmScript('build:web'),
  },
};

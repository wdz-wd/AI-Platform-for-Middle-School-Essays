import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

function findWorkspaceRoot() {
  const starts = [process.cwd(), __dirname];

  for (const start of starts) {
    let current = resolve(start);
    for (let depth = 0; depth < 8; depth += 1) {
      if (
        existsSync(resolve(current, 'package.json')) &&
        existsSync(resolve(current, 'backend')) &&
        existsSync(resolve(current, 'frontend'))
      ) {
        return current;
      }

      const parent = resolve(current, '..');
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return process.cwd();
}

export function resolveBackendEnvFiles() {
  const workspaceRoot = findWorkspaceRoot();
  return [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'backend', '.env'),
    resolve(workspaceRoot, 'backend', '.env'),
  ].filter((path, index, list) => existsSync(path) && list.indexOf(path) === index);
}

export function resolveUploadDir(rawUploadDir = '../uploads') {
  if (isAbsolute(rawUploadDir)) {
    return rawUploadDir;
  }

  const workspaceRoot = findWorkspaceRoot();
  const candidates = rawUploadDir.startsWith('..')
    ? [
        resolve(workspaceRoot, 'backend', rawUploadDir),
        resolve(process.cwd(), rawUploadDir),
        resolve(workspaceRoot, rawUploadDir),
      ]
    : [
        resolve(workspaceRoot, rawUploadDir),
        resolve(workspaceRoot, 'backend', rawUploadDir),
        resolve(process.cwd(), rawUploadDir),
      ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

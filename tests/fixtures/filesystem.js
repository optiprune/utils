import { lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Build the same small tree on every host OS. All assertions can use relative
 * POSIX-style paths while the fixture itself uses the host's path separator.
 */
export async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'optiprune-utils-'));
  const files = [
    'src/index.js',
    'src/index.test.js',
    'src/nested/deep.ts',
    'docs/readme.md',
    'docs/guide.txt',
    '.config/secret.json',
    'empty/.keep',
  ];

  await Promise.all(
    files.map(async relative => {
      const destination = join(root, ...relative.split('/'));
      await mkdir(join(destination, '..'), { recursive: true });
      await writeFile(destination, relative);
    }),
  );
  await mkdir(join(root, 'empty/real-directory'), { recursive: true });

  let symlinks = false;
  try {
    await symlink(join(root, 'src'), join(root, 'linked-src'), 'junction');
    symlinks = (await lstat(join(root, 'linked-src'))).isSymbolicLink();
  } catch {
    // Windows runners may disallow links without developer mode. The rest of
    // the fixture remains useful and the symlink assertions are conditional.
  }

  return {
    root,
    symlinks,
    path(...parts) {
      return join(root, ...parts.flatMap(part => String(part).split('/')));
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

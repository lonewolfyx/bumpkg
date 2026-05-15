import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanupLockFiles, getLockFilePaths } from '@/lock'
import { createTempDir, removeTempDir, writeText } from '../helpers'

describe('cleanupLockFiles', () => {
    test('builds supported lock file paths', () => {
        expect(getLockFilePaths('/project')).toEqual([
            '/project/package-lock.json',
            '/project/pnpm-lock.yaml',
            '/project/yarn.lock',
            '/project/bun.lockb',
        ])
    })

    test('removes a single lock file', async () => {
        const directory = await createTempDir('bumpkg-lock-single')

        try {
            await writeText(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')

            const result = await cleanupLockFiles(directory)

            expect(result.removed).toContain(join(directory, 'pnpm-lock.yaml'))
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('removes multiple lock files', async () => {
        const directory = await createTempDir('bumpkg-lock-multi')

        try {
            await writeText(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
            await writeText(join(directory, 'yarn.lock'), '# yarn lock\n')

            const result = await cleanupLockFiles(directory)

            expect(result.removed).toEqual(expect.arrayContaining([
                join(directory, 'pnpm-lock.yaml'),
                join(directory, 'yarn.lock'),
            ]))
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('returns stable output when lock files are missing', async () => {
        const directory = await createTempDir('bumpkg-lock-missing')

        try {
            const result = await cleanupLockFiles(directory)

            expect(result.removed).toHaveLength(0)
            expect(result.missing).toHaveLength(4)
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('does not delete non lock files', async () => {
        const directory = await createTempDir('bumpkg-lock-safe')
        const filePath = join(directory, 'README.md')

        try {
            await writeText(filePath, '# readme\n')
            await cleanupLockFiles(directory)

            await expect(stat(filePath)).resolves.toBeTruthy()
        }
        finally {
            await removeTempDir(directory)
        }
    })
})

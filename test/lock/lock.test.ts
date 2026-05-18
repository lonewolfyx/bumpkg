import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanupLockFiles } from '@/lock'
import { createTempDir, removeTempDir, writeText } from '../helpers'

describe('cleanupLockFiles', () => {
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
            expect(result.missing).toHaveLength(5)
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

    test('reports lock files that exist but cannot be removed', async () => {
        const directory = await createTempDir('bumpkg-lock-failed')
        const filePath = join(directory, 'package-lock.json')

        try {
            await mkdir(filePath, { recursive: true })

            const result = await cleanupLockFiles(directory)

            expect(result.failed).toEqual([
                expect.objectContaining({
                    filePath,
                }),
            ])
            expect(result.missing).not.toContain(filePath)
        }
        finally {
            await removeTempDir(directory)
        }
    })
})

import type { CliDeps, RegistryPackageMetadata } from '@/types'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkUpdateDependencies } from '@/check'
import { runCli } from '@/cli'
import { resolveConfig } from '@/config'
import { cleanupLockFiles } from '@/lock'
import { applyDependencyUpdates } from '@/update'
import { createTempDir, removeTempDir, writeJson, writeText } from '../helpers'

function createMetadataMap(entries: Record<string, RegistryPackageMetadata>) {
    return vi.fn(async (packageName: string) => {
        const metadata = entries[packageName]
        if (!metadata)
            throw new Error(`Missing metadata for ${packageName}`)
        return metadata
    })
}

function createRuntime(directory: string, fetchPackageMetadata: ReturnType<typeof createMetadataMap>, confirmed: boolean, output: string[]): CliDeps {
    return {
        resolveConfig,
        checkUpdateDependencies: (config, options) => checkUpdateDependencies(config, {
            ...options,
            fetchPackageMetadata,
        }),
        confirmUpdates: vi.fn().mockResolvedValue(confirmed),
        applyDependencyUpdates,
        cleanupLockFiles,
        stdout: {
            log: (message: string) => output.push(message),
        },
        stderr: console,
    }
}

describe('cli integration', () => {
    test('handles the no-update path', async () => {
        const directory = await createTempDir('bumpkg-cli-no-update')
        const output: string[] = []

        try {
            await writeJson(join(directory, 'package.json'), {
                name: 'demo',
                dependencies: {
                    lodash: '^1.0.0',
                },
            })

            await runCli(['--cwd', directory], createRuntime(directory, createMetadataMap({
                lodash: {
                    name: 'lodash',
                    versions: ['1.0.0'],
                    distTags: { latest: '1.0.0' },
                },
            }), true, output))

            expect(output).toEqual(['No updatable dependencies found.'])
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('updates dependencies and deletes lock files after confirmation', async () => {
        const directory = await createTempDir('bumpkg-cli-update')
        const output: string[] = []
        const packagePath = join(directory, 'package.json')

        try {
            await writeJson(packagePath, {
                name: 'demo',
                dependencies: {
                    lodash: '^1.0.0',
                },
            })
            await writeText(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')

            await runCli(['--cwd', directory], createRuntime(directory, createMetadataMap({
                lodash: {
                    name: 'lodash',
                    versions: ['1.0.0', '1.2.0'],
                    distTags: { latest: '1.2.0' },
                },
            }), true, output))

            expect(await readFile(packagePath, 'utf8')).toContain('"lodash": "^1.2.0"')
            expect(output.some(line => line.includes('Updated 1 dependencies'))).toBe(true)
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('includes major upgrades when --major is enabled', async () => {
        const directory = await createTempDir('bumpkg-cli-major')
        const packagePath = join(directory, 'package.json')

        try {
            await writeJson(packagePath, {
                name: 'demo',
                dependencies: {
                    vue: '^1.0.0',
                },
            })

            await runCli(['--cwd', directory, '--major'], createRuntime(directory, createMetadataMap({
                vue: {
                    name: 'vue',
                    versions: ['1.0.0', '2.0.0'],
                    distTags: { latest: '2.0.0' },
                },
            }), true, []))

            expect(await readFile(packagePath, 'utf8')).toContain('"vue": "^2.0.0"')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('keeps files unchanged when confirmation is declined', async () => {
        const directory = await createTempDir('bumpkg-cli-cancel')
        const packagePath = join(directory, 'package.json')

        try {
            await writeJson(packagePath, {
                name: 'demo',
                dependencies: {
                    lodash: '^1.0.0',
                },
            })

            await runCli(['--cwd', directory], createRuntime(directory, createMetadataMap({
                lodash: {
                    name: 'lodash',
                    versions: ['1.0.0', '1.2.0'],
                    distTags: { latest: '1.2.0' },
                },
            }), false, []))

            expect(await readFile(packagePath, 'utf8')).toContain('"lodash": "^1.0.0"')
        }
        finally {
            await removeTempDir(directory)
        }
    })
})

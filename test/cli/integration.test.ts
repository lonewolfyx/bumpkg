import type { RegistryPackageMetadata } from '@/types'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { confirm } from '@clack/prompts'
import { runCliWithOptions } from '@/cli'
import * as npmModule from '@/npm'
import { createTempDir, removeTempDir, writeJson, writeText } from '../helpers'

vi.mock('@clack/prompts', () => ({
    confirm: vi.fn(),
    isCancel: vi.fn(() => false),
}))

function createMetadataMap(entries: Record<string, RegistryPackageMetadata>) {
    return vi.fn(async (packageName: string) => {
        const metadata = entries[packageName]
        if (!metadata)
            throw new Error(`Missing metadata for ${packageName}`)
        return metadata
    })
}

describe('cli integration', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

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
            vi.spyOn(npmModule, 'getPackageMetadata').mockImplementation(createMetadataMap({
                lodash: {
                    name: 'lodash',
                    versions: ['1.0.0'],
                    distTags: { latest: '1.0.0' },
                },
            }))
            vi.mocked(confirm).mockResolvedValue(true)
            vi.spyOn(console, 'log').mockImplementation((message: string) => output.push(message))
            vi.spyOn(console, 'error').mockImplementation(() => {})

            await runCliWithOptions({ cwd: directory, major: false })

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
            vi.spyOn(npmModule, 'getPackageMetadata').mockImplementation(createMetadataMap({
                lodash: {
                    name: 'lodash',
                    versions: ['1.0.0', '1.2.0'],
                    distTags: { latest: '1.2.0' },
                },
            }))
            vi.mocked(confirm).mockResolvedValue(true)
            vi.spyOn(console, 'log').mockImplementation((message: string) => output.push(message))
            vi.spyOn(console, 'error').mockImplementation(() => {})

            await runCliWithOptions({ cwd: directory, major: false })

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
            vi.spyOn(npmModule, 'getPackageMetadata').mockImplementation(createMetadataMap({
                vue: {
                    name: 'vue',
                    versions: ['1.0.0', '2.0.0'],
                    distTags: { latest: '2.0.0' },
                },
            }))
            vi.mocked(confirm).mockResolvedValue(true)
            vi.spyOn(console, 'log').mockImplementation(() => {})
            vi.spyOn(console, 'error').mockImplementation(() => {})

            await runCliWithOptions({ cwd: directory, major: true })

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
            vi.spyOn(npmModule, 'getPackageMetadata').mockImplementation(createMetadataMap({
                lodash: {
                    name: 'lodash',
                    versions: ['1.0.0', '1.2.0'],
                    distTags: { latest: '1.2.0' },
                },
            }))
            vi.mocked(confirm).mockResolvedValue(false)
            vi.spyOn(console, 'log').mockImplementation(() => {})
            vi.spyOn(console, 'error').mockImplementation(() => {})

            await runCliWithOptions({ cwd: directory, major: false })

            expect(await readFile(packagePath, 'utf8')).toContain('"lodash": "^1.0.0"')
        }
        finally {
            await removeTempDir(directory)
        }
    })
})

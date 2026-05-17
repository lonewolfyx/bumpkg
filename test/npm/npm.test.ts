import type { VersionCacheFile } from '@/types'
import { join } from 'node:path'
import { ofetch } from 'ofetch'
import { getPackageMetadata, resolvePackageVersions } from '@/npm'
import { createTempDir, readJson, removeTempDir, writeJson } from '../helpers'

describe('npm registry cache', () => {
    afterEach(() => {
        vi.clearAllMocks()
        vi.restoreAllMocks()
    })

    test('writes first package lookup into node_modules/.bumpkg/version.json', async () => {
        const directory = await createTempDir('bumpkg-npm-cache-write')

        try {
            vi.mocked(ofetch).mockResolvedValue({
                'name': 'react',
                'versions': {
                    '18.2.0': {},
                    '18.3.1': {
                        engines: {
                            node: '>=18.0.0',
                        },
                    },
                },
                'dist-tags': {
                    latest: '18.3.1',
                },
            })

            const metadata = await getPackageMetadata('react', 'https://registry.npmjs.org/', directory)

            expect(metadata.versions).toEqual(['18.2.0', '18.3.1'])

            const cache = await readJson<VersionCacheFile>(join(directory, 'node_modules/.bumpkg/version.json'))
            expect(cache.registryUrl).toBe('https://registry.npmjs.org/')
            expect(cache.packages.react?.distTags.latest).toBe('18.3.1')
            expect(cache.packages.react?.enginesByVersion?.['18.3.1']?.node).toBe('>=18.0.0')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('reuses cached package metadata on later runs', async () => {
        const directory = await createTempDir('bumpkg-npm-cache-read')

        try {
            await writeJson(join(directory, 'node_modules/.bumpkg/version.json'), {
                registryUrl: 'https://registry.npmjs.org/',
                updatedAt: new Date().toISOString(),
                packages: {
                    react: {
                        name: 'react',
                        fetchedAt: new Date().toISOString(),
                        versions: ['18.2.0', '18.3.1'],
                        distTags: {
                            latest: '18.3.1',
                        },
                        enginesByVersion: {
                            '18.3.1': {
                                node: '>=18.0.0',
                            },
                        },
                    },
                },
            })

            const fetchSpy = vi.mocked(ofetch)
            const resolutions = await resolvePackageVersions(
                [{ name: 'react', specifier: '^18.0.0' }],
                'https://registry.npmjs.org/',
                directory,
            )

            expect(resolutions).toEqual([expect.objectContaining({
                metadata: expect.objectContaining({
                    name: 'react',
                }),
                name: 'react',
                specifier: '^18.0.0',
                version: '18.3.1',
            })])
            expect(fetchSpy).not.toHaveBeenCalled()
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('keeps partial batch results when one package lookup fails', async () => {
        const directory = await createTempDir('bumpkg-npm-partial-failure')

        try {
            vi.mocked(ofetch).mockImplementation(async (input) => {
                const url = String(input)
                if (url.includes('react')) {
                    return {
                        'name': 'react',
                        'versions': {
                            '18.2.0': {},
                            '18.3.1': {},
                        },
                        'dist-tags': {
                            latest: '18.3.1',
                        },
                    }
                }

                throw new Error('registry timeout')
            })

            const resolutions = await resolvePackageVersions([
                { name: 'react', specifier: '^18.0.0' },
                { name: 'broken', specifier: '^1.0.0' },
            ], 'https://registry.npmjs.org/', directory)

            expect(resolutions).toEqual([
                expect.objectContaining({
                    name: 'react',
                    version: '18.3.1',
                }),
                expect.objectContaining({
                    error: 'registry timeout',
                    name: 'broken',
                    version: null,
                }),
            ])
        }
        finally {
            await removeTempDir(directory)
        }
    })
})

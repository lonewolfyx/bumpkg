import type { DependencyEntry, ProjectConfig, RegistryPackageMetadata } from '@/types'
import { checkUpdateDependencies, createUpdateCandidate } from '@/check'

function createProjectConfig(entries: DependencyEntry[]): ProjectConfig {
    return {
        cwd: '/project',
        rootDir: '/project',
        rootPackagePath: '/project/package.json',
        monorepo: false,
        packages: ['/project/package.json'],
        dependencies: entries.filter(entry => entry.source === 'dependencies'),
        devDependencies: entries.filter(entry => entry.source === 'devDependencies'),
        optionalDependencies: entries.filter(entry => entry.source === 'optionalDependencies'),
        catalogDependencies: entries.filter(entry => entry.source === 'catalog' || entry.source === 'catalogs'),
        allDependencies: entries,
    }
}

function createEntry(name: string, version: string, source: DependencyEntry['source'] = 'dependencies'): DependencyEntry {
    return {
        name,
        version,
        source,
        filePath: '/project/package.json',
        manifestFormat: 'json',
    }
}

describe('checkUpdateDependencies', () => {
    test('createUpdateCandidate builds a result for processable entries', () => {
        const metadata: RegistryPackageMetadata = {
            name: 'demo',
            versions: ['1.0.0', '1.1.0'],
            distTags: {
                latest: '1.1.0',
            },
        }

        expect(createUpdateCandidate(createEntry('demo', '^1.0.0'), metadata, false)).toEqual(
            expect.objectContaining({
                name: 'demo',
                newVersion: '1.1.0',
                nextSpecifier: '^1.1.0',
                updateLevel: 'minor',
            }),
        )
    })

    test('supports caret ranges', async () => {
        const fetchPackageMetadata = vi.fn().mockResolvedValue({
            name: 'lodash',
            versions: ['4.17.0', '4.17.21'],
            distTags: { latest: '4.17.21' },
        })

        const result = await checkUpdateDependencies(
            createProjectConfig([createEntry('lodash', '^4.17.0')]),
            { fetchPackageMetadata },
        )

        expect(result.candidates[0]?.nextSpecifier).toBe('^4.17.21')
    })

    test('supports tilde ranges', async () => {
        const result = await checkUpdateDependencies(
            createProjectConfig([createEntry('webpack', '~1.9.10')]),
            {
                fetchPackageMetadata: vi.fn().mockResolvedValue({
                    name: 'webpack',
                    versions: ['1.9.10', '1.12.0'],
                    distTags: { latest: '1.12.0' },
                }),
            },
        )

        expect(result.candidates[0]?.nextSpecifier).toBe('~1.12.0')
    })

    test('supports wildcard ranges', async () => {
        const result = await checkUpdateDependencies(
            createProjectConfig([createEntry('react', '*')]),
            {
                fetchPackageMetadata: vi.fn().mockResolvedValue({
                    name: 'react',
                    versions: ['18.2.0'],
                    distTags: { latest: '18.2.0' },
                }),
            },
        )

        expect(result.candidates[0]).toEqual(expect.objectContaining({
            newVersion: '18.2.0',
            nextSpecifier: '18.2.0',
        }))
    })

    test('skips comparison ranges', async () => {
        const fetchPackageMetadata = vi.fn()
        const result = await checkUpdateDependencies(
            createProjectConfig([
                createEntry('a', '<1.0.0'),
                createEntry('b', '<=1.0.0'),
                createEntry('c', '>1.0.0'),
                createEntry('d', '>=1.0.0'),
            ]),
            { fetchPackageMetadata },
        )

        expect(result.candidates).toHaveLength(0)
        expect(fetchPackageMetadata).not.toHaveBeenCalled()
    })

    test('skips major updates by default', async () => {
        const result = await checkUpdateDependencies(
            createProjectConfig([createEntry('vue', '^1.0.0')]),
            {
                fetchPackageMetadata: vi.fn().mockResolvedValue({
                    name: 'vue',
                    versions: ['1.0.0', '2.0.0'],
                    distTags: { latest: '2.0.0' },
                }),
            },
        )

        expect(result.candidates).toHaveLength(0)
    })

    test('includes major updates when enabled', async () => {
        const result = await checkUpdateDependencies(
            createProjectConfig([createEntry('vue', '^1.0.0')]),
            {
                includeMajor: true,
                fetchPackageMetadata: vi.fn().mockResolvedValue({
                    name: 'vue',
                    versions: ['1.0.0', '2.0.0'],
                    distTags: { latest: '2.0.0' },
                }),
            },
        )

        expect(result.candidates[0]).toEqual(expect.objectContaining({
            updateLevel: 'major',
            nextSpecifier: '^2.0.0',
        }))
    })

    test('deduplicates repeated registry requests', async () => {
        const fetchPackageMetadata = vi.fn().mockResolvedValue({
            name: 'shared',
            versions: ['1.0.0', '1.1.0'],
            distTags: { latest: '1.1.0' },
        })

        await checkUpdateDependencies(
            createProjectConfig([
                createEntry('shared', '^1.0.0'),
                createEntry('shared', '^1.0.0', 'devDependencies'),
            ]),
            { fetchPackageMetadata },
        )

        expect(fetchPackageMetadata).toHaveBeenCalledTimes(1)
    })

    test('resolves version batches once for duplicate package and range lookups', async () => {
        const resolvePackageVersions = vi.fn().mockResolvedValue([
            {
                name: 'shared',
                specifier: '>=1.0.0<2.0.0',
                version: '1.1.0',
            },
        ])

        const result = await checkUpdateDependencies(
            createProjectConfig([
                createEntry('shared', '^1.0.0'),
                createEntry('shared', '^1.0.0', 'devDependencies'),
            ]),
            { resolvePackageVersions },
        )

        expect(resolvePackageVersions).toHaveBeenCalledTimes(1)
        expect(resolvePackageVersions).toHaveBeenCalledWith([
            {
                name: 'shared',
                specifier: '>=1.0.0<2.0.0',
            },
        ])
        expect(result.candidates).toHaveLength(2)
    })

    test('uses latest lookup when major updates are enabled', async () => {
        const result = await checkUpdateDependencies(
            createProjectConfig([createEntry('vue', '^1.0.0')]),
            {
                includeMajor: true,
                resolvePackageVersions: vi.fn().mockResolvedValue([
                    {
                        name: 'vue',
                        specifier: '*',
                        version: '2.0.0',
                    },
                ]),
            },
        )

        expect(result.candidates[0]).toEqual(expect.objectContaining({
            updateLevel: 'major',
            nextSpecifier: '^2.0.0',
        }))
    })

    test('collects registry errors with stable output', async () => {
        const result = await checkUpdateDependencies(
            createProjectConfig([createEntry('broken', '^1.0.0')]),
            {
                fetchPackageMetadata: vi.fn().mockRejectedValue(new Error('boom')),
            },
        )

        expect(result.candidates).toHaveLength(0)
        expect(result.errors).toEqual([
            expect.objectContaining({
                name: 'broken',
                reason: 'boom',
            }),
        ])
    })
})

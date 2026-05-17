import type { UpdateCandidate } from '@/types'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyDependencyUpdates, applyUpdatesToFile, groupCandidatesByFile } from '@/update'
import { createTempDir, readJson, removeTempDir, writeJson, writeText } from '../helpers'

function createCandidate(overrides: Partial<UpdateCandidate> = {}): UpdateCandidate {
    return {
        name: 'lodash',
        currentVersion: '^4.17.0',
        currentSpecifier: '^4.17.0',
        newVersion: '4.17.21',
        nextSpecifier: '^4.17.21',
        updateLevel: 'minor',
        source: {
            filePath: '/tmp/package.json',
            source: 'dependencies',
            manifestFormat: 'json',
        },
        ...overrides,
    }
}

describe('applyDependencyUpdates', () => {
    test('updates a single package manifest', async () => {
        const directory = await createTempDir('bumpkg-update-single')
        const filePath = join(directory, 'package.json')

        try {
            await writeJson(filePath, {
                name: 'demo',
                dependencies: {
                    lodash: '^4.17.0',
                },
            })

            await applyUpdatesToFile(filePath, [
                createCandidate({
                    source: {
                        filePath,
                        source: 'dependencies',
                        manifestFormat: 'json',
                    },
                }),
            ])

            const manifest = await readJson<{ dependencies: Record<string, string> }>(filePath)
            expect(manifest.dependencies.lodash).toBe('^4.17.21')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('updates multiple package manifests', async () => {
        const directory = await createTempDir('bumpkg-update-multi')
        const firstFile = join(directory, 'packages/a/package.json')
        const secondFile = join(directory, 'packages/b/package.json')

        try {
            await writeJson(firstFile, {
                dependencies: {
                    a: '^1.0.0',
                },
            })
            await writeJson(secondFile, {
                devDependencies: {
                    b: '~2.0.0',
                },
            })

            const result = await applyDependencyUpdates([
                createCandidate({
                    name: 'a',
                    currentVersion: '^1.0.0',
                    currentSpecifier: '^1.0.0',
                    newVersion: '1.1.0',
                    nextSpecifier: '^1.1.0',
                    source: {
                        filePath: firstFile,
                        source: 'dependencies',
                        manifestFormat: 'json',
                    },
                }),
                createCandidate({
                    name: 'b',
                    currentVersion: '~2.0.0',
                    currentSpecifier: '~2.0.0',
                    newVersion: '2.0.5',
                    nextSpecifier: '~2.0.5',
                    source: {
                        filePath: secondFile,
                        source: 'devDependencies',
                        manifestFormat: 'json',
                    },
                }),
            ])

            expect(result.updatedCount).toBe(2)
            expect((await readJson<{ dependencies: Record<string, string> }>(firstFile)).dependencies.a).toBe('^1.1.0')
            expect((await readJson<{ devDependencies: Record<string, string> }>(secondFile)).devDependencies.b).toBe('~2.0.5')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('updates catalog entries in workspace yaml', async () => {
        const directory = await createTempDir('bumpkg-update-catalog')
        const filePath = join(directory, 'pnpm-workspace.yaml')

        try {
            await writeText(filePath, 'catalog:\n  react: ^18.2.0\n')

            await applyUpdatesToFile(filePath, [
                createCandidate({
                    name: 'react',
                    currentVersion: '^18.2.0',
                    currentSpecifier: '^18.2.0',
                    newVersion: '18.3.0',
                    nextSpecifier: '^18.3.0',
                    source: {
                        filePath,
                        source: 'catalog',
                        manifestFormat: 'yaml',
                    },
                }),
            ])

            expect(await readFile(filePath, 'utf8')).toContain('react: ^18.3.0')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('updates catalogs entries in workspace yaml', async () => {
        const directory = await createTempDir('bumpkg-update-catalogs')
        const filePath = join(directory, 'pnpm-workspace.yaml')

        try {
            await writeText(filePath, 'catalogs:\n  react18:\n    react: ^18.2.0\n')

            await applyUpdatesToFile(filePath, [
                createCandidate({
                    name: 'react',
                    currentVersion: '^18.2.0',
                    currentSpecifier: '^18.2.0',
                    newVersion: '18.3.0',
                    nextSpecifier: '^18.3.0',
                    source: {
                        filePath,
                        source: 'catalogs',
                        manifestFormat: 'yaml',
                        catalogName: 'react18',
                    },
                }),
            ])

            expect(await readFile(filePath, 'utf8')).toContain('react: ^18.3.0')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('preserves yaml comments when updating workspace entries', async () => {
        const directory = await createTempDir('bumpkg-update-yaml-comments')
        const filePath = join(directory, 'pnpm-workspace.yaml')

        try {
            await writeText(filePath, '# keep this comment\ncatalog:\n  react: ^18.2.0\n')

            await applyUpdatesToFile(filePath, [
                createCandidate({
                    name: 'react',
                    currentVersion: '^18.2.0',
                    currentSpecifier: '^18.2.0',
                    newVersion: '18.3.0',
                    nextSpecifier: '^18.3.0',
                    source: {
                        filePath,
                        source: 'catalog',
                        manifestFormat: 'yaml',
                    },
                }),
            ])

            const content = await readFile(filePath, 'utf8')
            expect(content).toContain('# keep this comment')
            expect(content).toContain('react: ^18.3.0')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('updates dependencies and workspaces catalogs in the same package.json', async () => {
        const directory = await createTempDir('bumpkg-update-bun-catalog')
        const filePath = join(directory, 'package.json')

        try {
            await writeJson(filePath, {
                dependencies: {
                    lodash: '^4.17.0',
                },
                workspaces: {
                    catalog: {
                        react: '^18.2.0',
                    },
                    catalogs: {
                        react18: {
                            'react-dom': '^18.2.0',
                        },
                    },
                },
            })

            await applyUpdatesToFile(filePath, [
                createCandidate({
                    source: {
                        filePath,
                        source: 'dependencies',
                        manifestFormat: 'json',
                    },
                }),
                createCandidate({
                    name: 'react',
                    currentVersion: '^18.2.0',
                    currentSpecifier: '^18.2.0',
                    newVersion: '18.3.0',
                    nextSpecifier: '^18.3.0',
                    source: {
                        filePath,
                        source: 'catalog',
                        manifestFormat: 'json',
                    },
                }),
                createCandidate({
                    name: 'react-dom',
                    currentVersion: '^18.2.0',
                    currentSpecifier: '^18.2.0',
                    newVersion: '18.3.0',
                    nextSpecifier: '^18.3.0',
                    source: {
                        filePath,
                        source: 'catalogs',
                        manifestFormat: 'json',
                        catalogName: 'react18',
                    },
                }),
            ])

            const manifest = await readJson<{
                dependencies: Record<string, string>
                workspaces: {
                    catalog: Record<string, string>
                    catalogs: Record<string, Record<string, string>>
                }
            }>(filePath)
            const react18Catalog = manifest.workspaces.catalogs.react18

            expect(manifest.dependencies.lodash).toBe('^4.17.21')
            expect(manifest.workspaces.catalog.react).toBe('^18.3.0')
            expect(react18Catalog).toBeDefined()
            expect(react18Catalog?.['react-dom']).toBe('^18.3.0')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('skips major candidates by default during grouping', () => {
        const grouped = groupCandidatesByFile([
            createCandidate({
                updateLevel: 'major',
            }),
        ], false)

        expect(grouped.size).toBe(0)
    })

    test('allows major candidates when enabled', () => {
        const filePath = '/tmp/package.json'
        const grouped = groupCandidatesByFile([
            createCandidate({
                updateLevel: 'major',
                source: {
                    filePath,
                    source: 'dependencies',
                    manifestFormat: 'json',
                },
            }),
        ], true)

        expect(grouped.get(filePath)).toHaveLength(1)
    })

    test('always applies wildcard candidates even when major updates are excluded', () => {
        const filePath = '/tmp/package.json'
        const grouped = groupCandidatesByFile([
            createCandidate({
                currentVersion: '*',
                currentSpecifier: '*',
                nextSpecifier: '4.17.21',
                updateLevel: 'major',
                source: {
                    filePath,
                    source: 'dependencies',
                    manifestFormat: 'json',
                },
            }),
        ], false)

        expect(grouped.get(filePath)).toHaveLength(1)
    })
})

import { join } from 'node:path'
import { extractCatalogEntries, resolveConfig } from '@/config'
import { createTempDir, removeTempDir, writeJson, writeText } from '../helpers'

const fixturesDir = join(process.cwd(), 'test', 'fixtures')

describe('resolveConfig', () => {
    test('resolves a single package project', async () => {
        const cwd = join(fixturesDir, 'single')
        const config = await resolveConfig(cwd)

        expect(config.monorepo).toBe(false)
        expect(config.packages).toEqual([join(cwd, 'package.json')])
        expect(config.dependencies.map(item => item.name)).toContain('lodash')
        expect(config.devDependencies.map(item => item.name)).toContain('@types/lodash')
    })

    test('resolves a monorepo from workspace config', async () => {
        const directory = await createTempDir('bumpkg-config-monorepo')

        try {
            await writeJson(join(directory, 'package.json'), {
                name: 'root',
                private: true,
                dependencies: {
                    rootdep: '^1.0.0',
                },
            })
            await writeText(join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
            await writeJson(join(directory, 'packages/foo/package.json'), {
                name: 'foo',
                dependencies: {
                    foo: '^1.0.0',
                },
            })
            await writeJson(join(directory, 'packages/bar/package.json'), {
                name: 'bar',
                devDependencies: {
                    bar: '^1.1.0',
                },
            })

            const config = await resolveConfig(join(directory, 'packages/foo'))

            expect(config.monorepo).toBe(true)
            expect(config.packages).toEqual([
                join(directory, 'package.json'),
                join(directory, 'packages/bar/package.json'),
                join(directory, 'packages/foo/package.json'),
            ])
            expect(config.dependencies.map(item => item.name)).toEqual(expect.arrayContaining(['rootdep', 'foo']))
            expect(config.devDependencies.map(item => item.name)).toContain('bar')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('collects pnpm catalog and catalogs entries', async () => {
        const cwd = join(fixturesDir, 'pnpm-catalog')
        const config = await resolveConfig(cwd)

        expect(config.catalogDependencies).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'react',
                source: 'catalog',
                filePath: join(cwd, 'pnpm-workspace.yaml'),
            }),
            expect.objectContaining({
                name: 'react',
                source: 'catalogs',
                catalogName: 'react17',
                filePath: join(cwd, 'pnpm-workspace.yaml'),
            }),
        ]))
    })

    test('collects yarn catalog entries from .yarnrc.yml', async () => {
        const cwd = join(fixturesDir, 'yarn-catalog')
        const config = await resolveConfig(cwd)

        expect(config.catalogDependencies).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'react',
                source: 'catalog',
                filePath: join(cwd, '.yarnrc.yml'),
            }),
        ]))
    })

    test('collects bun workspaces catalog entries from package.json', async () => {
        const cwd = join(fixturesDir, 'bun-catalog')
        const config = await resolveConfig(cwd)

        expect(config.catalogDependencies).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'react',
                source: 'catalog',
                filePath: join(cwd, 'package.json'),
            }),
            expect.objectContaining({
                name: 'react',
                source: 'catalogs',
                catalogName: 'react17',
                filePath: join(cwd, 'package.json'),
            }),
        ]))
    })

    test('supports package.yaml manifests', async () => {
        const cwd = join(fixturesDir, 'package-yaml')
        const config = await resolveConfig(cwd)

        expect(config.packages).toEqual([join(cwd, 'package.yaml')])
        expect(config.dependencies.map(item => item.name)).toContain('react')
        expect(config.optionalDependencies.map(item => item.name)).toContain('multer')
    })

    test('throws when no manifest can be found', async () => {
        const directory = await createTempDir('bumpkg-config-empty')

        try {
            await expect(resolveConfig(directory)).rejects.toThrow(/Unable to locate package manifest/)
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('extractCatalogEntries returns both catalog shapes', () => {
        const entries = extractCatalogEntries('/tmp/pnpm-workspace.yaml', {
            catalog: {
                vue: '^3.5.0',
            },
            catalogs: {
                legacy: {
                    vue: '^2.7.0',
                },
            },
        })

        expect(entries).toEqual([
            expect.objectContaining({
                name: 'vue',
                source: 'catalog',
            }),
            expect.objectContaining({
                name: 'vue',
                source: 'catalogs',
                catalogName: 'legacy',
            }),
        ])
    })
})

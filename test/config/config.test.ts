import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { ofetch } from 'ofetch'
import { resolveConfig } from '@/config'
import { resolvePackageVersions } from '@/npm'
import { extractCatalogEntries } from '@/package/catalog'
import { createTempDir, removeTempDir, writeJson, writeText } from '../helpers'

const fixturesDir = join(process.cwd(), 'test', 'fixtures')

function createArgs(cwd: string) {
    return {
        c: '',
        cwd,
        major: false,
        _: [''],
    }
}

describe('resolveConfig', () => {
    afterEach(() => {
        vi.clearAllMocks()
    })

    test('resolves a single package project', async () => {
        const cwd = join(fixturesDir, 'single')
        const config = await resolveConfig(createArgs(cwd))

        expect(config.monorepo).toBe(false)
        expect(config.packageManagement).toBe('pnpm')
        expect(config.packageManager).toBe('')
        expect(config.packages).toEqual([join(cwd, 'package.json')])
        expect(config.dependencies.map(item => item.name)).toContain('lodash')
        expect(config.devDependencies.map(item => item.name)).toContain('@types/lodash')
        expect(config.workspaceFilePath).toBe('')
        expect(config.workspaceConfig).toEqual({})
        expect(config.yarnConfigPath).toBe('')
        expect(config.yarnConfig).toEqual({})
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
            await writeText(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n')
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

            const config = await resolveConfig(createArgs(join(directory, 'packages/foo')))

            expect(config.monorepo).toBe(true)
            expect(config.packageManagement).toBe('pnpm')
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
        const config = await resolveConfig(createArgs(cwd))

        expect(config.packageManagement).toBe('pnpm')
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

    test('tracks which dependency nodes reference catalog entries', async () => {
        const directory = await createTempDir('bumpkg-config-catalog-types')

        try {
            await writeJson(join(directory, 'package.json'), {
                name: 'demo',
                private: true,
                dependencies: {
                    react: 'catalog:',
                },
                devDependencies: {
                    'react-dom': 'catalog:react18',
                },
            })
            await writeText(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n')
            await writeText(join(directory, 'pnpm-workspace.yaml'), `packages:
  - .
catalog:
  react: ^18.2.0
catalogs:
  react18:
    react-dom: ^18.2.0
`)

            const config = await resolveConfig(createArgs(directory))

            expect(config.catalogDependencies).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    name: 'react',
                    source: 'catalog',
                    dependencyTypes: ['dependencies'],
                }),
                expect.objectContaining({
                    name: 'react-dom',
                    source: 'catalogs',
                    catalogName: 'react18',
                    dependencyTypes: ['devDependencies'],
                }),
            ]))
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('collects yarn catalog entries from .yarnrc.yml', async () => {
        const cwd = join(fixturesDir, 'yarn-catalog')
        const config = await resolveConfig(createArgs(cwd))

        expect(config.packageManagement).toBe('yarn')
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
        const config = await resolveConfig(createArgs(cwd))

        expect(config.packageManagement).toBe('bun')
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
        const config = await resolveConfig(createArgs(cwd))

        expect(config.packages).toEqual([join(cwd, 'package.yaml')])
        expect(config.packageManagement).toBe('pnpm')
        expect(config.packageManager).toBe('pnpm@10.19.0')
        expect(config.dependencies.map(item => item.name)).toContain('react')
        expect(config.peerDependencies.map(item => item.name)).toContain('react-dom')
        expect(config.optionalDependencies.map(item => item.name)).toContain('multer')
    })

    test('supports package.yml manifests', async () => {
        const directory = await createTempDir('bumpkg-config-package-yml')
        const manifestPath = join(directory, 'package.yml')

        try {
            await writeText(manifestPath, 'name: demo\ndependencies:\n  react: ^18.2.0\n')

            const config = await resolveConfig(createArgs(directory))

            expect(config.packages).toEqual([manifestPath])
            expect(config.dependencies.map(item => item.name)).toContain('react')
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('treats a package under a pnpm workspace ancestor as part of the monorepo', async () => {
        const directory = await createTempDir('bumpkg-config-standalone')
        const standalonePath = join(directory, 'docs/package.json')

        try {
            await writeJson(join(directory, 'package.json'), {
                name: 'root',
                private: true,
            })
            await writeText(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n')
            await writeText(join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
            await writeJson(join(directory, 'packages/app/package.json'), {
                name: 'app',
                dependencies: {
                    app: '^1.0.0',
                },
            })
            await writeJson(standalonePath, {
                name: 'docs',
                dependencies: {
                    vitepress: '^1.0.0',
                },
            })

            const config = await resolveConfig(createArgs(join(directory, 'docs')))

            expect(config.rootPackagePath).toBe(join(directory, 'package.json'))
            expect(config.monorepo).toBe(true)
            expect(config.packages).toEqual([
                join(directory, 'docs/package.json'),
                join(directory, 'package.json'),
                join(directory, 'packages/app/package.json'),
            ])
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('throws when no manifest can be found', async () => {
        const directory = await createTempDir('bumpkg-config-empty')

        try {
            await expect(resolveConfig(createArgs(directory))).rejects.toThrow(/Unable to locate package manifest/)
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('does not probe registries during config resolution', async () => {
        const directory = await createTempDir('bumpkg-config-registry')

        try {
            await writeJson(join(directory, 'package.json'), {
                name: 'demo',
                dependencies: {
                    react: '^18.2.0',
                },
            })

            const fetchSpy = vi.mocked(ofetch)

            const config = await resolveConfig(createArgs(directory))

            expect(config.rootDir).toBe(directory)
            expect(fetchSpy).not.toHaveBeenCalled()
            await expect(access(join(directory, 'node_modules/.bumpkg/registry.json'))).rejects.toThrow()
        }
        finally {
            await removeTempDir(directory)
        }
    })

    test('probes registries lazily when package metadata is not cached', async () => {
        const directory = await createTempDir('bumpkg-config-lazy-registry')

        try {
            const fetchSpy = vi.mocked(ofetch).mockImplementation(async (url) => {
                const requestUrl = typeof url === 'string' ? url : url.toString()
                if (requestUrl.endsWith('/react/latest'))
                    return {}
                if (requestUrl.startsWith('https://registry.npmmirror.com/react')) {
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
                throw new Error('unreachable')
            })

            const resolutions = await resolvePackageVersions(
                [{ name: 'react', specifier: '^18.0.0' }],
                undefined,
                directory,
            )

            expect(resolutions[0]?.version).toBe('18.3.1')
            expect(fetchSpy).toHaveBeenCalledTimes(4)
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
                dependencyTypes: [],
            }),
            expect.objectContaining({
                name: 'vue',
                source: 'catalogs',
                catalogName: 'legacy',
                dependencyTypes: [],
            }),
        ])
    })
})

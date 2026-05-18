import type { CatalogDependencyType, CommandArgs, DependencyEntry, DependencyType, PackageManagement, ProjectConfig } from './types'
import { DEPENDENCY_FIELDS } from './constant'
import { getBunWorkspaceConfig } from './package/bun'
import { createCatalogEntryKey, extractCatalogEntries } from './package/catalog'
import { collectDependencyEntries } from './package/dependency'
import { readProjectManifest } from './package/manifest'
import { resolvePackageContext } from './package/project'

function resolveCatalogDependencies(
    packageManagement: PackageManagement,
    config: Pick<ProjectConfig, 'rootPackagePath' | 'workspaceFilePath' | 'workspaceConfig' | 'yarnConfigPath' | 'yarnConfig'>,
    rootManifest: Awaited<ReturnType<typeof readProjectManifest>>,
    catalogDependencyTypes: ReadonlyMap<string, DependencyType[]>,
) {
    const entries: DependencyEntry[] = []

    if (packageManagement === 'bun') {
        const bunWorkspaceConfig = getBunWorkspaceConfig(rootManifest)

        if (bunWorkspaceConfig)
            entries.push(...extractCatalogEntries(config.rootPackagePath, bunWorkspaceConfig, catalogDependencyTypes))
    }

    if (config.workspaceFilePath)
        entries.push(...extractCatalogEntries(config.workspaceFilePath, config.workspaceConfig, catalogDependencyTypes))

    if (packageManagement === 'yarn' && config.yarnConfigPath)
        entries.push(...extractCatalogEntries(config.yarnConfigPath, config.yarnConfig, catalogDependencyTypes))

    return entries
}

function parseCatalogReference(specifier: string): { source: CatalogDependencyType, catalogName?: string } | null {
    if (!specifier.startsWith('catalog:'))
        return null

    const catalogName = specifier.slice('catalog:'.length).trim()
    return catalogName
        ? { source: 'catalogs', catalogName }
        : { source: 'catalog' }
}

function collectCatalogDependencyTypes(
    manifests: Array<{ packagePath: string, manifest: Awaited<ReturnType<typeof readProjectManifest>> }>,
): Map<string, DependencyType[]> {
    const catalogDependencyTypes = new Map<string, Set<DependencyType>>()

    for (const { manifest } of manifests) {
        for (const field of DEPENDENCY_FIELDS) {
            for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
                const reference = parseCatalogReference(specifier)
                if (!reference)
                    continue

                const key = createCatalogEntryKey(name, reference.source, reference.catalogName)
                const dependencyTypes = catalogDependencyTypes.get(key) ?? new Set<DependencyType>()
                dependencyTypes.add(field)
                catalogDependencyTypes.set(key, dependencyTypes)
            }
        }
    }

    return new Map(
        Array.from(catalogDependencyTypes.entries()).map(([key, dependencyTypes]) => [
            key,
            DEPENDENCY_FIELDS.filter(field => dependencyTypes.has(field)),
        ]),
    )
}

export async function resolveConfig(options: CommandArgs): Promise<ProjectConfig> {
    const { cwd } = options

    const {
        monorepo,
        packages,
        rootPackagePath,
        rootManifest,
        packageManagement,
        workspaceFilePath,
        workspaceConfig,
        yarnConfigPath,
        yarnConfig,
        rootDir,
        packageManager,
    } = await resolvePackageContext(cwd)

    const packagePaths = monorepo
        ? packages
        : [rootPackagePath]

    const manifests = await Promise.all(
        packagePaths.map(async packagePath => ({
            packagePath,
            manifest: packagePath === rootPackagePath
                ? rootManifest
                : await readProjectManifest(packagePath),
        })),
    )
    const catalogDependencyTypes = collectCatalogDependencyTypes(manifests)

    const {
        dependencies,
        devDependencies,
        peerDependencies,
        optionalDependencies,
    } = DEPENDENCY_FIELDS.reduce<Record<DependencyType, ProjectConfig['dependencies']>>((accumulator, field) => {
        accumulator[field] = manifests.flatMap(({ packagePath, manifest }) =>
            collectDependencyEntries(packagePath, manifest, field),
        )
        return accumulator
    }, {
        dependencies: [],
        devDependencies: [],
        peerDependencies: [],
        optionalDependencies: [],
    })

    const catalogDependencies = resolveCatalogDependencies(packageManagement, {
        rootPackagePath,
        workspaceFilePath,
        workspaceConfig,
        yarnConfigPath,
        yarnConfig,
    }, rootManifest, catalogDependencyTypes)

    return {
        cwd,
        rootDir,
        rootPackagePath,
        packageManagement,
        packageManager,
        monorepo,
        packages: packagePaths,
        dependencies,
        devDependencies,
        peerDependencies,
        optionalDependencies,
        catalogDependencies,
        allDependencies: [
            ...dependencies,
            ...devDependencies,
            ...peerDependencies,
            ...optionalDependencies,
            ...catalogDependencies,
        ],
        workspaceFilePath,
        workspaceConfig,
        yarnConfigPath,
        yarnConfig,
    }
}

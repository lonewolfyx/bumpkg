import type { CommandArgs, DependencyEntry, DependencyType, PackageManagement, ProjectConfig } from './types'
import { DEPENDENCY_FIELDS } from './constant'
import { getBunWorkspaceConfig } from './package/bun'
import { extractCatalogEntries } from './package/catalog'
import { collectDependencyEntries } from './package/dependency'
import { readProjectManifest } from './package/manifest'
import { resolvePackageContext } from './package/project'

function resolveCatalogDependencies(
    packageManagement: PackageManagement,
    config: Pick<ProjectConfig, 'rootPackagePath' | 'workspaceFilePath' | 'workspaceConfig' | 'yarnConfigPath' | 'yarnConfig'>,
    rootManifest: Awaited<ReturnType<typeof readProjectManifest>>,
) {
    const entries: DependencyEntry[] = []

    if (packageManagement === 'bun') {
        const bunWorkspaceConfig = getBunWorkspaceConfig(rootManifest)

        if (bunWorkspaceConfig)
            entries.push(...extractCatalogEntries(config.rootPackagePath, bunWorkspaceConfig))
    }

    if (config.workspaceFilePath)
        entries.push(...extractCatalogEntries(config.workspaceFilePath, config.workspaceConfig))

    if (packageManagement === 'yarn' && config.yarnConfigPath)
        entries.push(...extractCatalogEntries(config.yarnConfigPath, config.yarnConfig))

    return entries
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
    }, rootManifest)

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

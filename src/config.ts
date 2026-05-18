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
    const packageContext = await resolvePackageContext(cwd)
    const packagePaths = packageContext.monorepo
        ? packageContext.packages
        : [packageContext.rootPackagePath]
    const manifests = await Promise.all(
        packagePaths.map(async packagePath => ({
            packagePath,
            manifest: packagePath === packageContext.rootPackagePath
                ? packageContext.rootManifest
                : await readProjectManifest(packagePath),
        })),
    )

    const dependenciesByType = DEPENDENCY_FIELDS.reduce<Record<DependencyType, ProjectConfig['dependencies']>>((accumulator, field) => {
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
    const catalogDependencies = resolveCatalogDependencies(packageContext.packageManagement, {
        rootPackagePath: packageContext.rootPackagePath,
        workspaceFilePath: packageContext.workspaceFilePath,
        workspaceConfig: packageContext.workspaceConfig,
        yarnConfigPath: packageContext.yarnConfigPath,
        yarnConfig: packageContext.yarnConfig,
    }, packageContext.rootManifest)

    return {
        cwd,
        rootDir: packageContext.rootDir,
        rootPackagePath: packageContext.rootPackagePath,
        packageManagement: packageContext.packageManagement,
        packageManager: packageContext.packageManager,
        monorepo: packageContext.monorepo,
        packages: packagePaths,
        dependencies: dependenciesByType.dependencies,
        devDependencies: dependenciesByType.devDependencies,
        peerDependencies: dependenciesByType.peerDependencies,
        optionalDependencies: dependenciesByType.optionalDependencies,
        catalogDependencies,
        allDependencies: [
            ...dependenciesByType.dependencies,
            ...dependenciesByType.devDependencies,
            ...dependenciesByType.peerDependencies,
            ...dependenciesByType.optionalDependencies,
            ...catalogDependencies,
        ],
        workspaceFilePath: packageContext.workspaceFilePath,
        workspaceConfig: packageContext.workspaceConfig,
        yarnConfigPath: packageContext.yarnConfigPath,
        yarnConfig: packageContext.yarnConfig,
    }
}

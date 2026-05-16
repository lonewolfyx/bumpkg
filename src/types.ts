import type { ParsedArgs } from 'citty'

export type PackageJsonPath = string

export type DeepWriteable<T> = {
    -readonly [P in keyof T]: T[P] extends object ? DeepWriteable<T[P]> : T[P]
}

export type CommandArgs = ParsedArgs<DeepWriteable<typeof import('./args').args>>

export type ManifestFormat = 'json' | 'yaml'

export type DependencyType = 'dependencies' | 'devDependencies' | 'optionalDependencies'

export type CatalogDependencyType = 'catalog' | 'catalogs'

export type DependencySource = DependencyType | CatalogDependencyType

export type UpdateLevel = 'major' | 'minor' | 'patch'

export interface PackageManifest {
    name?: string
    private?: boolean
    packages?: string[]
    workspaces?: string[] | WorkspaceConfig
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
}

export interface WorkspaceConfig {
    packages?: string[]
    catalog?: Record<string, string>
    catalogs?: Record<string, Record<string, string>>
}

export interface DependencyLocation {
    filePath: string
    source: DependencySource
    manifestFormat: ManifestFormat
    catalogName?: string
}

export interface DependencyEntry extends DependencyLocation {
    name: string
    version: string
}

export interface ProjectConfig {
    cwd: string
    rootDir: string
    registryUrl: string
    rootPackagePath: PackageJsonPath
    monorepo: boolean
    packages: PackageJsonPath[]
    dependencies: DependencyEntry[]
    devDependencies: DependencyEntry[]
    optionalDependencies: DependencyEntry[]
    catalogDependencies: DependencyEntry[]
    allDependencies: DependencyEntry[]
    workspaceFilePath?: string
    yarnConfigPath?: string
}

export interface PnpmWorkspaceContext {
    filePath: string
    rootPackagePath?: PackageJsonPath
    workspaceConfig: WorkspaceConfig
    packagePaths: PackageJsonPath[]
}

export interface PackageContext {
    rootDir: string
    rootPackagePath: PackageJsonPath
    rootManifest: PackageManifest
    monorepo: boolean
    packages: PackageJsonPath[]
    workspaceFilePath?: string
    workspaceConfig?: WorkspaceConfig
    yarnConfigPath?: string
    yarnConfig?: WorkspaceConfig
}

export interface RegistryPackageMetadata {
    name: string
    versions: string[]
    distTags: Record<string, string | undefined>
}

export interface PackageVersionQuery {
    name: string
    specifier: string
}

export interface PackageVersionResolution extends PackageVersionQuery {
    version: string | null
}

export interface CheckUpdateOptions {
    includeMajor?: boolean
    resolvePackageVersions?: (queries: readonly PackageVersionQuery[], registryUrl?: string, rootDir?: string) => Promise<PackageVersionResolution[]>
    fetchPackageMetadata?: (packageName: string, registryUrl?: string, rootDir?: string) => Promise<RegistryPackageMetadata>
}

export interface CheckUpdateError {
    name: string
    currentVersion: string
    reason: string
    source: DependencyLocation
}

export interface UpdateCandidate {
    name: string
    currentVersion: string
    currentSpecifier: string
    newVersion: string
    nextSpecifier: string
    updateLevel: UpdateLevel
    source: DependencyLocation
}

export interface CheckUpdateResult {
    candidates: UpdateCandidate[]
    errors: CheckUpdateError[]
}

export interface ApplyUpdatesOptions {
    includeMajor?: boolean
}

export interface UpdatedFileResult {
    filePath: string
    updatedDependencies: string[]
}

export interface ApplyUpdatesResult {
    updatedFiles: UpdatedFileResult[]
    updatedCount: number
}

export interface CleanupLockResult {
    removed: string[]
    missing: string[]
    failed: Array<{
        filePath: string
        reason: string
    }>
}

export interface VersionCacheEntry {
    name: string
    fetchedAt: string
    versions: string[]
    distTags: Record<string, string | undefined>
}

export interface VersionCacheFile {
    registryUrl: string
    updatedAt: string
    packages: Record<string, VersionCacheEntry>
}

import type { ParsedArgs } from 'citty'

export type DeepWriteable<T> = {
    -readonly [P in keyof T]: T[P] extends object ? DeepWriteable<T[P]> : T[P]
}

export type CommandArgs = ParsedArgs<DeepWriteable<typeof import('./args').args>>

export type ManifestFormat = 'json' | 'yaml'

export type DependencyType = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'

export type CatalogDependencyType = 'catalog' | 'catalogs'

export type DependencySource = DependencyType | CatalogDependencyType

export type PackageManagement = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown'

export type UpdateLevel = 'major' | 'minor' | 'patch'

export interface PackageManifest {
    name?: string
    packageManager?: string
    private?: boolean
    packages?: string[]
    workspaces?: string[] | WorkspaceConfig
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
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
    dependencyTypes?: DependencyType[]
}

export interface DependencyEntry extends DependencyLocation {
    name: string
    version: string
}

export interface ProjectConfig {
    cwd: string
    rootDir: string
    rootPackagePath: string
    packageManagement: PackageManagement
    packageManager: string
    monorepo: boolean
    packages: string[]
    dependencies: DependencyEntry[]
    devDependencies: DependencyEntry[]
    peerDependencies: DependencyEntry[]
    optionalDependencies: DependencyEntry[]
    catalogDependencies: DependencyEntry[]
    allDependencies: DependencyEntry[]
    workspaceFilePath: string
    workspaceConfig: WorkspaceConfig
    yarnConfigPath: string
    yarnConfig: WorkspaceConfig
}

export interface PackageContext {
    rootDir: string
    rootPackagePath: string
    rootManifest: PackageManifest
    packageManagement: PackageManagement
    packageManager: string
    monorepo: boolean
    packages: string[]
    workspaceFilePath: string
    workspaceConfig: WorkspaceConfig
    yarnConfigPath: string
    yarnConfig: WorkspaceConfig
}

export interface RegistryPackageMetadata {
    name: string
    versions: string[]
    distTags: Record<string, string | undefined>
    enginesByVersion?: Record<string, {
        node?: string
    }>
}

export interface PackageVersionQuery {
    name: string
    specifier: string
}

export interface PackageVersionResolution extends PackageVersionQuery {
    version: string | null
    metadata?: RegistryPackageMetadata
    error?: string
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
    targetNodeRequirement?: string
    availableMajorVersion?: string
    availableMajorNodeRequirement?: string
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
    enginesByVersion?: Record<string, {
        node?: string
    }>
}

export interface VersionCacheFile {
    registryUrl: string
    updatedAt: string
    packages: Record<string, VersionCacheEntry>
}

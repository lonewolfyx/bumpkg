export type PackageJsonPath = string

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

export interface RegistryPackageMetadata {
    name: string
    versions: string[]
    distTags: Record<string, string | undefined>
}

export interface CheckUpdateOptions {
    includeMajor?: boolean
    fetchPackageMetadata?: (packageName: string) => Promise<RegistryPackageMetadata>
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
}

export interface CliOptions {
    cwd: string
    major: boolean
}

export interface CliDeps {
    resolveConfig: (cwd: string) => Promise<ProjectConfig>
    checkUpdateDependencies: (config: ProjectConfig, options: CheckUpdateOptions) => Promise<CheckUpdateResult>
    confirmUpdates: () => Promise<boolean>
    applyDependencyUpdates: (candidates: UpdateCandidate[], options: ApplyUpdatesOptions) => Promise<ApplyUpdatesResult>
    cleanupLockFiles: (cwd: string) => Promise<CleanupLockResult>
    stdout: Pick<Console, 'log'>
    stderr: Pick<Console, 'error'>
}

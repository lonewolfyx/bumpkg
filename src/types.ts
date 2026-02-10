export interface IPackageJson {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
}

export type TCatalog = 'catalog' | 'catalogs'

export interface ICatalogItem {
    dependency: string
    version: string
    type: TCatalog
    category: string
}

export interface IDependencies {
    dependency: string
    version: string
}

export interface IConfig {
    cwd: string
    npm: boolean
    pnpm: boolean
    monorepo: boolean
    catalog: ICatalogItem[]
    dependencies?: IDependencies[]
    devDependencies?: IDependencies[]
    optionalDependencies?: IDependencies[]
}

export interface IPnpmWorkspaceConfig {
    packages?: string[]
    catalog?: Record<string, string>
    catalogs?: Record<string, Record<string, string>>
}

export interface INpmPackageRegistryMetaData {
    'name': string
    'dist-tags': Record<string, string>
    'versions': Record<string, {
        version: string
        _npmVersion: string
        _nodeVersion: string
    }[]>
    'time': Record<string, string>
}

export interface IRangeStats {
    range: string
    min: string | null
    max: string | null
    count: number
}

export interface IDistTags extends Record<string, string | undefined> {
    latest?: string
}

export interface INpmSemverResult {
    // subRange: IRangeStats[]
    versions: string[]
    version: string
}

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

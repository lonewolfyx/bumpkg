import type { CatalogDependencyType, DependencyEntry, DependencyType, WorkspaceConfig } from '../types'
import { resolveManifestFormat } from './manifest'

export function createCatalogEntryKey(
    name: string,
    source: CatalogDependencyType,
    catalogName?: string,
): string {
    return `${source}\u0000${catalogName ?? ''}\u0000${name}`
}

export function extractCatalogEntries(
    filePath: string,
    workspaceConfig: WorkspaceConfig,
    catalogDependencyTypes: ReadonlyMap<string, DependencyType[]> = new Map(),
): DependencyEntry[] {
    const catalogEntries = Object.entries(workspaceConfig.catalog ?? {}).map(([name, version]) => ({
        name,
        version,
        filePath,
        source: 'catalog' as const,
        manifestFormat: resolveManifestFormat(filePath),
        dependencyTypes: catalogDependencyTypes.get(createCatalogEntryKey(name, 'catalog')) ?? [],
    }))

    const catalogsEntries = Object.entries(workspaceConfig.catalogs ?? {}).flatMap(([catalogName, catalog]) =>
        Object.entries(catalog).map(([name, version]) => ({
            name,
            version,
            filePath,
            source: 'catalogs' as const,
            manifestFormat: resolveManifestFormat(filePath),
            catalogName,
            dependencyTypes: catalogDependencyTypes.get(createCatalogEntryKey(name, 'catalogs', catalogName)) ?? [],
        })),
    )

    return [
        ...catalogEntries,
        ...catalogsEntries,
    ]
}

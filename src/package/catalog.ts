import type { DependencyEntry, WorkspaceConfig } from '../types'
import { resolveManifestFormat } from './manifest'

export function extractCatalogEntries(
    filePath: string,
    workspaceConfig: WorkspaceConfig,
): DependencyEntry[] {
    const catalogEntries = Object.entries(workspaceConfig.catalog ?? {}).map(([name, version]) => ({
        name,
        version,
        filePath,
        source: 'catalog' as const,
        manifestFormat: resolveManifestFormat(filePath),
    }))

    const catalogsEntries = Object.entries(workspaceConfig.catalogs ?? {}).flatMap(([catalogName, catalog]) =>
        Object.entries(catalog).map(([name, version]) => ({
            name,
            version,
            filePath,
            source: 'catalogs' as const,
            manifestFormat: resolveManifestFormat(filePath),
            catalogName,
        })),
    )

    return [
        ...catalogEntries,
        ...catalogsEntries,
    ]
}

import type { DependencyEntry, ManifestFormat, WorkspaceConfig } from '../types'
import { extname } from 'node:path'
import { YAML_FILE_EXTENSIONS } from '../constant'

export function extractCatalogEntries(
    filePath: string,
    workspaceConfig: WorkspaceConfig,
): DependencyEntry[] {
    const manifestFormat: ManifestFormat = YAML_FILE_EXTENSIONS.includes(extname(filePath) as typeof YAML_FILE_EXTENSIONS[number]) ? 'yaml' : 'json'
    const catalogEntries = Object.entries(workspaceConfig.catalog ?? {}).map(([name, version]) => ({
        name,
        version,
        filePath,
        source: 'catalog' as const,
        manifestFormat,
    }))

    const catalogsEntries = Object.entries(workspaceConfig.catalogs ?? {}).flatMap(([catalogName, catalog]) =>
        Object.entries(catalog).map(([name, version]) => ({
            name,
            version,
            filePath,
            source: 'catalogs' as const,
            manifestFormat,
            catalogName,
        })),
    )

    return [
        ...catalogEntries,
        ...catalogsEntries,
    ]
}

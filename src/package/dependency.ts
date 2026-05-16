import type { DependencyEntry, DependencyType, ManifestFormat, PackageManifest } from '../types'
import { extname } from 'node:path'
import { YAML_FILE_EXTENSIONS } from '../constant'

export function collectDependencyEntries(
    filePath: string,
    manifest: PackageManifest,
    field: DependencyType,
): DependencyEntry[] {
    const manifestFormat: ManifestFormat = YAML_FILE_EXTENSIONS.includes(extname(filePath) as typeof YAML_FILE_EXTENSIONS[number]) ? 'yaml' : 'json'

    return Object.entries(manifest[field] ?? {}).map(([name, version]) => ({
        name,
        version,
        filePath,
        source: field,
        manifestFormat,
    }))
}

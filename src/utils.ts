import type { DependencyLocation, DependencyType, WorkspaceConfig } from './types'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { DEPENDENCY_FIELDS } from './constant'

export function normalizeRegistryUrl(registryUrl: string): string {
    return registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
}

export function isWildcardSpecifier(specifier: string): boolean {
    return specifier.trim() === '*'
}

export function toPrettyJson(value: unknown): string {
    return `${JSON.stringify(value, null, 4)}\n`
}

export function toDependencyLocation(location: DependencyLocation): DependencyLocation {
    return {
        filePath: location.filePath,
        source: location.source,
        manifestFormat: location.manifestFormat,
        catalogName: location.catalogName,
        dependencyTypes: location.dependencyTypes,
    }
}

export function getDependencyTypes(location: DependencyLocation): DependencyType[] {
    if (DEPENDENCY_FIELDS.includes(location.source as DependencyType))
        return [location.source as DependencyType]

    const dependencyTypes = location.dependencyTypes ?? []
    return DEPENDENCY_FIELDS.filter(field => dependencyTypes.includes(field))
}

export async function readYamlConfig(filePath: string): Promise<WorkspaceConfig> {
    return parse(await readFile(filePath, 'utf8')) as WorkspaceConfig
}

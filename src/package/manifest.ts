import type { ManifestFormat, PackageManifest, WorkspaceConfig } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { parse, stringify } from 'yaml'
import { YAML_FILE_EXTENSIONS } from '../constant'
import { toPrettyJson } from '../utils'

export const PACKAGE_MANIFEST_GLOB = 'package.{json,yaml,yml}'

export function resolveManifestFormat(filePath: string): ManifestFormat {
    return YAML_FILE_EXTENSIONS.includes(extname(filePath) as typeof YAML_FILE_EXTENSIONS[number])
        ? 'yaml'
        : 'json'
}

export function isYamlManifestPath(filePath: string): boolean {
    return resolveManifestFormat(filePath) === 'yaml'
}

export async function readProjectManifest(filePath: string): Promise<PackageManifest> {
    const content = await readFile(filePath, 'utf8')

    return isYamlManifestPath(filePath)
        ? parse(content) as PackageManifest
        : JSON.parse(content) as PackageManifest
}

export async function writeProjectManifest(filePath: string, manifest: PackageManifest | WorkspaceConfig): Promise<void> {
    const content = isYamlManifestPath(filePath)
        ? `${stringify(manifest)}`
        : toPrettyJson(manifest)

    await writeFile(filePath, content, 'utf8')
}

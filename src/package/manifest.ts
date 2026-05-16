import type { PackageManifest, WorkspaceConfig } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { parse, stringify } from 'yaml'
import { YAML_FILE_EXTENSIONS } from '../constant'
import { toPrettyJson } from '../utils'

export const PACKAGE_MANIFEST_GLOB = 'package.{json,yaml,yml}'

export async function readProjectManifest(filePath: string): Promise<PackageManifest> {
    const content = await readFile(filePath, 'utf8')
    const isYamlManifest = YAML_FILE_EXTENSIONS.includes(extname(filePath) as typeof YAML_FILE_EXTENSIONS[number])

    return isYamlManifest
        ? parse(content) as PackageManifest
        : JSON.parse(content) as PackageManifest
}

export async function writeProjectManifest(filePath: string, manifest: PackageManifest | WorkspaceConfig): Promise<void> {
    const isYamlManifest = YAML_FILE_EXTENSIONS.includes(extname(filePath) as typeof YAML_FILE_EXTENSIONS[number])
    const content = isYamlManifest
        ? `${stringify(manifest)}`
        : toPrettyJson(manifest)

    await writeFile(filePath, content, 'utf8')
}

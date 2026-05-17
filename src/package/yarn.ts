import type { WorkspaceConfig } from '../types'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

export async function readYarnConfig(filePath: string): Promise<WorkspaceConfig> {
    return parse(await readFile(filePath, 'utf8')) as WorkspaceConfig
}

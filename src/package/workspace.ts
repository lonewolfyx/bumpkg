import type { PackageManifest } from '../types'
import { getBunWorkspaceConfig } from './bun'

export function getManifestWorkspacePatterns(manifest: PackageManifest): string[] {
    const bunWorkspaceConfig = getBunWorkspaceConfig(manifest)

    return Array.from(new Set([
        ...(manifest.packages ?? []),
        ...(Array.isArray(manifest.workspaces) ? manifest.workspaces : []),
        ...(bunWorkspaceConfig?.packages ?? []),
    ]))
}

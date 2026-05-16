import type { PackageManifest, WorkspaceConfig } from '../types'

export function getBunWorkspaceConfig(manifest: PackageManifest): WorkspaceConfig | undefined {
    if (!manifest.workspaces || Array.isArray(manifest.workspaces))
        return undefined

    return manifest.workspaces
}

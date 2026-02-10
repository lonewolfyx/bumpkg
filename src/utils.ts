import type { IDependencies } from '@/types.ts'

export const formatDependencies = (dependencies: Record<string, string>): IDependencies[] => {
    return Object.entries(dependencies)
        .flatMap(([dependency, version]) => [{
            dependency,
            version,
        }])
}

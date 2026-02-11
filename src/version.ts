import type { IDistTags, INpmSemverResult, IRangeStats } from '@/types.ts'
import semver from 'semver'
import { getNpmRegistryMetaData } from '@/npm.ts'

class SemverMatcher {
    static isSatisfied(
        version: string,
        range: string,
        distTags: IDistTags,
        maxAllowed: string | null,
    ): boolean {
        if (distTags[range] === version)
            return true

        const isMatched = semver.satisfies(version, range)

        const isWithinBounds = !maxAllowed || semver.lte(version, maxAllowed)

        return isMatched && isWithinBounds
    }

    static updateStats(stats: IRangeStats, version: string): void {
        stats.count++
        if (stats.min === null || semver.lt(version, stats.min))
            stats.min = version
        if (stats.max === null || semver.gt(version, stats.max))
            stats.max = version
    }
}

export const getNpmSemVerCalculator = async (packageName: string, rangeInput: string): Promise<INpmSemverResult> => {
    const data = await getNpmRegistryMetaData(packageName)
    const allVersions = Object.keys(data.versions)
    const distTags = data['dist-tags']

    const latestTagVersion = distTags.latest ?? null

    const targetTagVersion = distTags[rangeInput]
    if (targetTagVersion) {
        return {
            versions: [targetTagVersion],
            version: targetTagVersion,
        }
    }

    if (!semver.validRange(rangeInput)) {
        throw new Error('Invalid semver range')
    }

    const maxLimit: string | null = (latestTagVersion && semver.satisfies(latestTagVersion, rangeInput))
        ? latestTagVersion
        : null

    const subRangeStats: IRangeStats[] = rangeInput.split('||').map(r => ({
        range: r.trim(),
        min: null,
        max: null,
        count: 0,
    }))

    const matchedVersions = allVersions.filter((version) => {
        const isGlobalMatch = SemverMatcher.isSatisfied(version, rangeInput, distTags, maxLimit)

        if (isGlobalMatch) {
            for (const stats of subRangeStats) {
                if (SemverMatcher.isSatisfied(version, stats.range, distTags, maxLimit)) {
                    SemverMatcher.updateStats(stats, version)
                }
            }
        }
        return isGlobalMatch
    })

    return {
        // subRange: subRangeStats,
        versions: matchedVersions,
        version: matchedVersions.at(-1) || '',
    }
}

function generateSummary(name: string, range: string, total: number, stats: IRangeStats[]): string[] {
    if (total === 0)
        return ['0 versions found. There are no versions matching your search']

    let detail: string
    if (total < 10) {
        const vList = stats.reduce((acc: string[], s) => {
            if (s.min)
                acc.push(s.min)
            if (s.max)
                acc.push(s.max)
            return acc
        }, [])
        detail = Array.from(new Set(vList)).join(', ')
    }
    else {
        detail = stats
            .filter(s => s.count > 0)
            .map((s) => {
                if (s.count === 1)
                    return s.min
                if (s.count === 2)
                    return `${s.min}, ${s.max}`
                return `from ${s.min} to ${s.max}`
            })
            .join(', ')
    }

    return [`${total} satisfying version${total > 1 ? 's' : ''} for ${name}, range ${range.replace('||', ' and ')}: ${detail}`]
}

/**
 * 版本信息类型
 */
export interface PackageVersionInfo {
    /** 包名 */
    name: string
    /** 当前版本 */
    currentVersion: string
    /** 最新版本 */
    latestVersion: string
    /** 是否有过新版本 */
    outdated: boolean
    /** 依赖类型 */
    type: 'dependencies' | 'devDependencies' | 'optionalDependencies' | 'catalog'
    /** catalog 分类名称（如果是 catalog 类型） */
    catalogName?: string
}

/**
 * 版本检查结果
 */
export interface VersionCheckResult {
    /** 过时的依赖列表 */
    outdated: PackageVersionInfo[]
    /** 所有的依赖信息 */
    all: PackageVersionInfo[]
    /** 检查成功的数量 */
    checked: number
    /** 检查失败的数量 */
    failed: number
}

/**
 * npm registry 响应类型
 */
interface NpmRegistryResponse {
    'dist-tags': {
        latest: string
    }
    'versions': Record<string, any>
}

/**
 * 获取包的最新版本
 * @param packageName 包名
 * @returns 最新版本号
 */
export async function getLatestVersion(packageName: string): Promise<string | null> {
    try {
        const response = await fetch(`https://registry.npmjs.org/${packageName}`)

        if (!response.ok) {
            return null
        }

        const data: NpmRegistryResponse = await response.json()
        return data['dist-tags']?.latest || null
    }
    catch (error) {
        console.error(`Error fetching version for ${packageName}:`, error)
        return null
    }
}

/**
 * 批量获取包的最新版本
 * @param packageNames 包名数组
 * @returns 包名到最新版本的映射
 */
export async function batchGetLatestVersions(packageNames: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {}
    const batchSize = 10 // 每次查询 10 个包，避免过载

    for (let i = 0; i < packageNames.length; i += batchSize) {
        const batch = packageNames.slice(i, i + batchSize)
        const promises = batch.map(async (packageName) => {
            const version = await getLatestVersion(packageName)
            return { packageName, version }
        })

        const batchResults = await Promise.all(promises)
        batchResults.forEach(({ packageName, version }) => {
            if (version) {
                result[packageName] = version
            }
        })
    }

    return result
}

/**
 * 对比版本号
 * @param current 当前版本号
 * @param latest 最新版本号
 * @returns 如果当前版本过时返回 true
 */
export function isVersionOutdated(current: string, latest: string): boolean {
    // 简单的版本号对比，实际可以使用 semver 库
    const cleanCurrent = current.replace(/^[\^~]/, '')
    const cleanLatest = latest.replace(/^[\^~]/, '')

    if (cleanCurrent === cleanLatest) {
        return false
    }

    const currentParts = cleanCurrent.split('.').map(Number)
    const latestParts = cleanLatest.split('.').map(Number)

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const currentPart = currentParts[i] || 0
        const latestPart = latestParts[i] || 0

        if (currentPart < latestPart) {
            return true
        }
        if (currentPart > latestPart) {
            return false
        }
    }

    return false
}

/**
 * 检查依赖版本
 * @param dependencies 依赖对象
 * @param latestVersions 最新版本映射
 * @param type 依赖类型
 * @returns 版本信息数组
 */
function checkDependencies(
    dependencies: Record<string, string>,
    latestVersions: Record<string, string>,
    type: 'dependencies' | 'devDependencies' | 'optionalDependencies',
): PackageVersionInfo[] {
    return Object.entries(dependencies).map(([name, currentVersion]) => {
        const latestVersion = latestVersions[name]
        return {
            name,
            currentVersion,
            latestVersion: latestVersion || 'unknown',
            outdated: latestVersion ? isVersionOutdated(currentVersion, latestVersion) : false,
            type,
        }
    })
}

/**
 * 检查 catalog 依赖版本
 * @param catalog catalog 数组
 * @param latestVersions 最新版本映射
 * @returns 版本信息数组
 */
function checkCatalog(
    catalog: Array<{ name: string, version: string, category: boolean, catalog_name?: string }>,
    latestVersions: Record<string, string>,
): PackageVersionInfo[] {
    return catalog.map((item) => {
        const latestVersion = latestVersions[item.name]
        return {
            name: item.name,
            currentVersion: item.version,
            latestVersion: latestVersion || 'unknown',
            outdated: latestVersion ? isVersionOutdated(item.version, latestVersion) : false,
            type: 'catalog' as const,
            catalogName: item.catalog_name,
        }
    })
}

/**
 * 执行版本检查
 * @param dependencies 依赖对象
 * @param devDependencies 开发依赖对象
 * @param optionalDependencies 可选依赖对象
 * @param catalog catalog 数组
 * @returns 版本检查结果
 */
export async function checkVersions(
    dependencies: Record<string, string>,
    devDependencies: Record<string, string>,
    optionalDependencies: Record<string, string>,
    catalog: Array<{ name: string, version: string, category: boolean, catalog_name?: string }>,
): Promise<VersionCheckResult> {
    // 收集所有包名
    const allPackageNames = new Set<string>()

    Object.keys(dependencies).forEach(name => allPackageNames.add(name))
    Object.keys(devDependencies).forEach(name => allPackageNames.add(name))
    Object.keys(optionalDependencies).forEach(name => allPackageNames.add(name))
    catalog.forEach(item => allPackageNames.add(item.name))

    // 批量获取最新版本
    const latestVersions = await batchGetLatestVersions(Array.from(allPackageNames))

    // 检查各类依赖
    const depResults = checkDependencies(dependencies, latestVersions, 'dependencies')
    const devDepResults = checkDependencies(devDependencies, latestVersions, 'devDependencies')
    const optDepResults = checkDependencies(optionalDependencies, latestVersions, 'optionalDependencies')
    const catalogResults = checkCatalog(catalog, latestVersions)

    // 合并所有结果
    const allResults = [...depResults, ...devDepResults, ...optDepResults, ...catalogResults]
    const outdatedResults = allResults.filter(result => result.outdated)

    return {
        outdated: outdatedResults,
        all: allResults,
        checked: allResults.filter(r => r.latestVersion !== 'unknown').length,
        failed: allResults.filter(r => r.latestVersion === 'unknown').length,
    }
}

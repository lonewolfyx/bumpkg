/**
 * @module bumpkg
 * @description Check for outdated dependencies in your project
 * @version 0.0.0
 */

/**
 * Catalog 项的类型定义
 */
export interface CatalogItem {
    /** 依赖名称 */
    name: string
    /** 版本号 */
    version: string
    /** 是否以 catalogs name 归类 */
    category: boolean
    /** 分类名称，如果 category 为 true 则有值 */
    catalog_name?: string
}

/**
 * 解析后的配置类型
 */
export interface ResolvedConfig {
    /** 当前用户执行的目录地址 */
    cwd: string
    /** 是否是使用的 npm */
    npm: boolean
    /** 是否是使用的 pnpm */
    pnpm: boolean
    /** 是否使用的 pnpm monorepo 项目 */
    monorepo: boolean
    /** Catalog 数据，针对 pnpm monorepo */
    catalog: CatalogItem[]
    /** 项目中对应的 dependencies 数据 */
    dependencies: Record<string, string>
    /** 项目中对应的 devDependencies 数据 */
    devDependencies: Record<string, string>
    /** 项目中对应的 optionalDependencies 数据 */
    optionalDependencies: Record<string, string>
}

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

// 导出主要函数
export { resolveConfig } from './config'
export { batchGetLatestVersions, checkVersions, getLatestVersion, isVersionOutdated } from './version-check'

import type { RegistryPackageMetadata } from '@/types'
import semver from 'semver'
import {
    buildNextSpecifier,
    buildSameMajorRangeSpecifier,
    detectUpdateLevel,
    getCurrentVersionFromSpecifier,
    resolveAvailableMajorVersion,
    resolveLatestVersion,
    resolveVersionNodeRequirement,
    selectTargetVersion,
    stripVersionPrefix,
} from '@/version'

const metadata: RegistryPackageMetadata = {
    name: 'demo',
    versions: ['1.0.0', '1.2.0', '1.2.5', '2.0.0'],
    distTags: {
        latest: '2.0.0',
    },
    enginesByVersion: {
        '1.2.5': {
            node: '>=18.0.0',
        },
        '2.0.0': {
            node: '>=20.0.0',
        },
    },
}

describe('version helpers', () => {
    test('stripVersionPrefix removes ^ and ~ prefixes', () => {
        expect(stripVersionPrefix('^1.2.3')).toBe('1.2.3')
        expect(stripVersionPrefix('~1.2.3')).toBe('1.2.3')
        expect(stripVersionPrefix('*')).toBe('*')
    })

    test('getCurrentVersionFromSpecifier parses semver values', () => {
        expect(getCurrentVersionFromSpecifier('^1.2.3')).toBe('1.2.3')
        expect(getCurrentVersionFromSpecifier('~1.2.3')).toBe('1.2.3')
        expect(getCurrentVersionFromSpecifier('*')).toBeNull()
    })

    test('detectUpdateLevel maps semver differences', () => {
        expect(detectUpdateLevel('1.0.0', '1.0.1')).toBe('patch')
        expect(detectUpdateLevel('1.0.0', '1.2.0')).toBe('minor')
        expect(detectUpdateLevel('1.0.0', '2.0.0')).toBe('major')
    })

    test('resolveLatestVersion prefers latest dist-tag', () => {
        expect(resolveLatestVersion(metadata)).toBe('2.0.0')
    })

    test('resolveVersionNodeRequirement reads the version engines data', () => {
        expect(resolveVersionNodeRequirement(metadata, '1.2.5')).toBe('>=18.0.0')
        expect(resolveVersionNodeRequirement(metadata, '1.0.0')).toBeNull()
    })

    test('resolveAvailableMajorVersion returns the latest stable higher major', () => {
        expect(resolveAvailableMajorVersion('1.0.0', metadata)).toBe('2.0.0')
        expect(resolveAvailableMajorVersion('2.0.0', metadata)).toBeNull()
    })

    test('buildNextSpecifier preserves supported prefixes', () => {
        expect(buildNextSpecifier('^1.0.0', '1.2.0')).toBe('^1.2.0')
        expect(buildNextSpecifier('~1.0.0', '1.2.0')).toBe('~1.2.0')
        expect(buildNextSpecifier('*', '1.2.0')).toBe('1.2.0')
    })

    test('buildSameMajorRangeSpecifier returns a valid semver range', () => {
        const range = buildSameMajorRangeSpecifier('^1.0.0')

        expect(range).toBe('>=1.0.0 <2.0.0')
        expect(range && semver.validRange(range)).toBe('>=1.0.0 <2.0.0')
    })

    test('selectTargetVersion skips major by default', () => {
        expect(selectTargetVersion('^1.0.0', metadata, false)).toEqual({
            newVersion: '1.2.5',
            nextSpecifier: '^1.2.5',
            updateLevel: 'minor',
        })
    })

    test('selectTargetVersion includes major when enabled', () => {
        expect(selectTargetVersion('^1.0.0', metadata, true)).toEqual({
            newVersion: '2.0.0',
            nextSpecifier: '^2.0.0',
            updateLevel: 'major',
        })
    })
})

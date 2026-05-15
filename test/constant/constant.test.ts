import {
    getRangePrefix,
    isSkippedRange,
    isSupportedRange,
} from '@/constant'

describe('constant helpers', () => {
    test('getRangePrefix detects supported prefixes', () => {
        expect(getRangePrefix('^1.2.3')).toBe('^')
        expect(getRangePrefix('~1.2.3')).toBe('~')
        expect(getRangePrefix('*')).toBe('*')
    })

    test('getRangePrefix detects skipped prefixes', () => {
        expect(getRangePrefix('<=1.2.3')).toBe('<=')
        expect(getRangePrefix('>1.2.3')).toBe('>')
    })

    test('isSupportedRange only allows ^ ~ *', () => {
        expect(isSupportedRange('^1.0.0')).toBe(true)
        expect(isSupportedRange('~1.0.0')).toBe(true)
        expect(isSupportedRange('*')).toBe(true)
        expect(isSupportedRange('1.0.0')).toBe(false)
    })

    test('isSkippedRange only matches comparison ranges', () => {
        expect(isSkippedRange('<1.0.0')).toBe(true)
        expect(isSkippedRange('>=1.0.0')).toBe(true)
        expect(isSkippedRange('^1.0.0')).toBe(false)
    })
})

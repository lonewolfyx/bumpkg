export const args = {
    cwd: {
        type: 'string',
        description: 'working directory',
        default: process.cwd(),
        alias: 'c',
        valueHint: 'path',
    },
    major: {
        type: 'boolean',
        description: 'include major version updates',
        default: false,
    },
} as const

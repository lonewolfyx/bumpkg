#!/usr/bin/env node
import('../dist/cli.mjs')
    .then(({ main }) => main())
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })

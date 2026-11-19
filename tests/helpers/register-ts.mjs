// Run the application TypeScript in Node tests using the same extension-less
// imports and local JSON modules that Vite resolves. No copied production logic.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (!['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(error.code) || !specifier.startsWith('.')) throw error
      for (const suffix of ['.ts', '.json', '/index.ts']) {
        try { return nextResolve(specifier + suffix, context) } catch (candidate) {
          if (candidate.code !== 'ERR_MODULE_NOT_FOUND') throw candidate
        }
      }
      throw error
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.json') && url.includes('/src/data/')) {
      const result = nextLoad(url, { ...context, format: 'json', importAttributes: { type: 'json' } })
      return { format: 'module', source: `export default ${String(result.source)}`, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

#!/usr/bin/env node
// Generates a text catalog of all shared tools by reading their .meta exports.
// Usage: node shared/tool-catalog.js
// Output: formatted markdown text to stdout, ready to inject into LLM prompt.

const fs = require('fs')
const path = require('path')

const TOOLS_DIR = path.join(__dirname, 'tools')

const files = fs.readdirSync(TOOLS_DIR)
  .filter(f => f.endsWith('.js'))
  .sort()

const entries = []

for (const file of files) {
  const filePath = path.join(TOOLS_DIR, file)
  try {
    delete require.cache[require.resolve(filePath)]
    const mod = require(filePath)
    const meta = mod.meta
    if (!meta) {
      // Fallback: extract first comment line as description
      const src = fs.readFileSync(filePath, 'utf8')
      const desc = (src.match(/^\s*\/\/\s*(.+)/m) || [])[1] || '(no description)'
      entries.push(`### ${path.basename(file, '.js')}\n${desc}\n`)
      continue
    }

    let entry = `### ${meta.name}\n${meta.description}\n`
    if (meta.params) {
      const params = Object.entries(meta.params)
        .map(([k, v]) => `  - \`${k}\`: ${v}`)
        .join('\n')
      entry += `Params:\n${params}\n`
    }
    if (meta.requires) entry += `Requires: ${meta.requires}\n`
    if (meta.provides) entry += `Provides: ${meta.provides}\n`
    entries.push(entry)
  } catch (e) {
    entries.push(`### ${path.basename(file, '.js')}\n(error loading: ${e.message})\n`)
  }
}

console.log(`## Available Tools (call with \`await tools.name({ args })\`)
`)
console.log(entries.join('\n'))

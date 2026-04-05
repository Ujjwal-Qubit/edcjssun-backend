import fs from "node:fs"
import path from "node:path"

const projectRoot = process.cwd()
const srcRoot = path.join(projectRoot, "src")

const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", "prisma"])
const JS_EXTS = [".js", ".mjs", ".cjs"]

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, out)
      continue
    }
    if (entry.isFile() && JS_EXTS.includes(path.extname(entry.name))) {
      out.push(fullPath)
    }
  }
  return out
}

function extractRelativeImports(code) {
  const imports = []

  const staticImport = /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g
  const dynamicImport = /import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g

  let match
  while ((match = staticImport.exec(code)) !== null) imports.push(match[1])
  while ((match = dynamicImport.exec(code)) !== null) imports.push(match[1])

  return imports
}

function resolveRelativeImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier)

  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.js"),
    path.join(base, "index.mjs"),
    path.join(base, "index.cjs")
  ]

  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

if (!fs.existsSync(srcRoot)) {
  console.error("verify:imports failed: src directory not found")
  process.exit(1)
}

const files = walk(srcRoot)
const missing = []

for (const filePath of files) {
  const code = fs.readFileSync(filePath, "utf8")
  const imports = extractRelativeImports(code)
  for (const specifier of imports) {
    const resolved = resolveRelativeImport(filePath, specifier)
    if (!resolved) {
      missing.push({
        file: path.relative(projectRoot, filePath).replaceAll("\\", "/"),
        specifier
      })
    }
  }
}

if (missing.length > 0) {
  console.error("verify:imports found missing relative imports:\n")
  for (const issue of missing) {
    console.error(`- ${issue.file} -> ${issue.specifier}`)
  }
  process.exit(1)
}

console.log(`verify:imports passed (${files.length} files checked)`)
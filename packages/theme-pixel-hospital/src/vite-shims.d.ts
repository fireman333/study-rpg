/**
 * Ambient declarations for Vite's `?url` query suffix and `import.meta.glob`.
 * Mirrors theme-pixel-medical's vite-shims.d.ts plus a glob signature so the
 * sprite registry compiles outside a Vite context.
 */
declare module '*.png?url' {
  const url: string
  export default url
}

declare module '*.jpg?url' {
  const url: string
  export default url
}

declare module '*.svg?url' {
  const url: string
  export default url
}

interface ImportMeta {
  glob(
    pattern: string,
    options?: { eager?: boolean; query?: string; import?: string },
  ): Record<string, unknown>
}

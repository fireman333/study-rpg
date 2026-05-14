/**
 * Ambient declarations for Vite's `?url` query suffix on static assets.
 * Lets a non-Vite package compile-check against Vite-bundled imports.
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

// Image imports resolve to URLs through the app's bundler (Vite).
declare module '*.webp' {
  const url: string
  export default url
}

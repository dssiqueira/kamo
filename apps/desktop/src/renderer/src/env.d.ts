import type { KamoApi } from '../../shared/api.ts'

declare global {
  interface Window {
    readonly kamo: KamoApi
  }
}

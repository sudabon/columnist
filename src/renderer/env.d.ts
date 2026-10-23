/// <reference types="vite/client" />
import type { ColumnistApi } from '../shared/types'

declare global {
  interface Window {
    columnist: ColumnistApi
  }
}

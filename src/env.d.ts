/** テストビルド(`--mode test`)でのみ true。本番ビルドでは false に置換され、関連コードは除去される */
declare const __COLUMNIST_TEST__: boolean

declare module '*.css?raw' {
  const content: string
  export default content
}

declare module '*?asset' {
  const path: string
  export default path
}

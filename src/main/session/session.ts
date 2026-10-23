import { session, type Session } from 'electron'

export const DEFAULT_PARTITION = 'persist:columnist-default'

/** 全カラムで共有する永続セッション。権限要求(通知・位置情報・カメラ・マイク等)はすべて拒否する */
export function createColumnSession(): Session {
  const ses = session.fromPartition(DEFAULT_PARTITION)
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.setDevicePermissionHandler(() => false)
  return ses
}

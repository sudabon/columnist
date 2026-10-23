/** 最終更新時刻を「2分前」形式で表す */
export function formatRelativeTime(timestamp: number | null, now: number): string {
  if (timestamp === null) return '未更新'
  const sec = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (sec < 60) return 'たった今'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}時間前`
  return `${Math.floor(hour / 24)}日前`
}

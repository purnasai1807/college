export function adminUrl(path: string, canteenId: string) {
  if (!canteenId) return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}canteenId=${encodeURIComponent(canteenId)}`
}

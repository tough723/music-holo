function sameId(left, right) {
  return left != null && right != null && String(left) === String(right)
}

function hasSong(selected, song) {
  return selected.some((item) => sameId(item.id, song?.id))
}

/** 切换一首歌的选中状态，保留其他页已经选中的曲目。 */
export function toggleSongSelection(selected, song) {
  const current = Array.isArray(selected) ? selected : []
  if (!song || song.id == null || song.id === '') return current.slice()
  if (hasSong(current, song)) return current.filter((item) => !sameId(item.id, song.id))
  return [...current, song]
}

/** 本页全选或取消本页；其他页的选择不受影响。 */
export function togglePageSelection(selected, pageSongs) {
  const current = Array.isArray(selected) ? selected : []
  const page = (Array.isArray(pageSongs) ? pageSongs : []).filter((song) => song && song.id != null && song.id !== '')
  if (!page.length) return current.slice()
  if (page.every((song) => hasSong(current, song))) {
    const pageIds = new Set(page.map((song) => String(song.id)))
    return current.filter((item) => !pageIds.has(String(item.id)))
  }
  const next = current.slice()
  for (const song of page) {
    if (!hasSong(next, song)) next.push(song)
  }
  return next
}

export function pageSelectionState(selected, pageSongs) {
  const current = Array.isArray(selected) ? selected : []
  const page = (Array.isArray(pageSongs) ? pageSongs : []).filter((song) => song && song.id != null && song.id !== '')
  const selectedCount = page.filter((song) => hasSong(current, song)).length
  return {
    all: page.length > 0 && selectedCount === page.length,
    indeterminate: selectedCount > 0 && selectedCount < page.length
  }
}

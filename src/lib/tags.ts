export function dedupeTags(tags: string[]): string[] {
  const uniqueTags = new Map<string, string>()

  tags
    .map((tag) => tag.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .forEach((tag) => {
      const normalized = tag.toLowerCase()

      if (!uniqueTags.has(normalized)) {
        uniqueTags.set(normalized, tag)
      }
    })

  return [...uniqueTags.values()]
}

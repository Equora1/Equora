'use client'

export async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('Screenshot konnte nicht gelesen werden.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Screenshot konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

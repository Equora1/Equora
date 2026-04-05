'use client'

export type SnippingOcrPhase = 'idle' | 'preparing' | 'recognizing' | 'ready' | 'error'

export type SnippingOcrProgress = {
  phase: SnippingOcrPhase
  progress: number
  status: string
}

type ProgressListener = (progress: SnippingOcrProgress) => void

type TesseractMessage = {
  status?: string
  progress?: number
}

const listeners = new Set<ProgressListener>()

let workerPromise: Promise<any> | null = null
let recognitionChain: Promise<unknown> = Promise.resolve()
let progressState: SnippingOcrProgress = {
  phase: 'idle',
  progress: 0,
  status: 'Erster OCR-Start lädt das Sprachmodell einmalig. Danach läuft es deutlich schneller.',
}

function emit(progress: Partial<SnippingOcrProgress>) {
  progressState = { ...progressState, ...progress }
  for (const listener of listeners) listener(progressState)
}

function toPercent(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value * 100)))
}

function describeTesseractMessage(message: TesseractMessage): SnippingOcrProgress {
  const rawStatus = String(message.status ?? '').trim().toLowerCase()
  const percent = toPercent(message.progress)

  if (rawStatus.includes('recogniz')) {
    return {
      phase: 'recognizing',
      progress: percent,
      status: percent > 0 ? `Text wird erkannt... ${percent}%` : 'Text wird erkannt...',
    }
  }

  if (rawStatus.includes('load') || rawStatus.includes('init')) {
    const readable = rawStatus
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const suffix = percent > 0 ? ` ${percent}%` : ''
    return {
      phase: 'preparing',
      progress: percent,
      status: `Sprachmodell wird einmalig geladen...${suffix}${readable ? ` (${readable})` : ''}`,
    }
  }

  return {
    phase: progressState.phase === 'recognizing' ? 'recognizing' : 'preparing',
    progress: percent,
    status: percent > 0 ? `OCR wird vorbereitet... ${percent}%` : 'OCR wird vorbereitet...',
  }
}

async function ensureWorker() {
  if (!workerPromise) {
    emit({
      phase: 'preparing',
      progress: 0,
      status: 'Sprachmodell wird einmalig geladen... Das kann beim ersten Mal kurz dauern.',
    })

    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: (message: TesseractMessage) => emit(describeTesseractMessage(message)),
      })
      emit({
        phase: 'ready',
        progress: 100,
        status: 'OCR ist bereit. Der erste Modell-Download ist erledigt.',
      })
      return worker
    })().catch((error) => {
      workerPromise = null
      const message = error instanceof Error ? error.message : 'OCR konnte nicht vorbereitet werden.'
      emit({ phase: 'error', progress: 0, status: message })
      throw error
    })
  }

  return workerPromise
}

function clamp(value: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value))
}

async function loadImageBitmap(source: Blob) {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(source)
  }

  const objectUrl = URL.createObjectURL(source)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Screenshot konnte nicht geladen werden.'))
      nextImage.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function preprocessSnippingImage(file: Blob) {
  emit({
    phase: 'preparing',
    progress: 0,
    status: 'Screenshot wird für OCR vorbereitet. Kontrast und Größe werden optimiert...',
  })

  const image = await loadImageBitmap(file)
  const width = 'width' in image ? image.width : 0
  const height = 'height' in image ? image.height : 0

  if (!width || !height) return file

  const longestEdge = Math.max(width, height)
  const upscaleFactor = longestEdge < 900 ? 3 : longestEdge < 1400 ? 2 : 1.4
  const maxEdge = 3200
  const scale = Math.min(upscaleFactor, maxEdge / longestEdge)
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return file

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image as CanvasImageSource, 0, 0, targetWidth, targetHeight)

  const imageData = context.getImageData(0, 0, targetWidth, targetHeight)
  const data = imageData.data

  let luminanceTotal = 0
  let brightPixels = 0
  for (let index = 0; index < data.length; index += 4) {
    const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
    luminanceTotal += luminance
    if (luminance > 150) brightPixels += 1
  }

  const pixelCount = data.length / 4
  const averageLuminance = pixelCount ? luminanceTotal / pixelCount : 255
  const brightRatio = pixelCount ? brightPixels / pixelCount : 1
  const invertForDarkTheme = averageLuminance < 95 || brightRatio < 0.22
  const contrastBoost = invertForDarkTheme ? 1.55 : 1.35
  const exposureOffset = invertForDarkTheme ? 10 : 0

  for (let index = 0; index < data.length; index += 4) {
    let luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722
    if (invertForDarkTheme) luminance = 255 - luminance
    luminance = clamp((luminance - 128) * contrastBoost + 128 + exposureOffset)

    data[index] = luminance
    data[index + 1] = luminance
    data[index + 2] = luminance
  }

  context.putImageData(imageData, 0, 0)

  const processedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1)
  })

  emit({
    phase: 'preparing',
    progress: 100,
    status: 'Screenshot vorbereitet. OCR startet jetzt auf der optimierten Version...',
  })

  return processedBlob ?? file
}

export function subscribeSnippingOcrProgress(listener: ProgressListener) {
  listeners.add(listener)
  listener(progressState)
  return () => {
    listeners.delete(listener)
  }
}

export async function preloadSnippingOcrWorker() {
  await ensureWorker()
}

export async function recognizeSnippingImage(file: Blob) {
  const runRecognition = async () => {
    const worker = await ensureWorker()
    const preparedImage = await preprocessSnippingImage(file)

    emit({ phase: 'recognizing', progress: 0, status: 'Text wird auf dem optimierten Screenshot erkannt...' })
    const primaryResult = await worker.recognize(preparedImage)
    let text = primaryResult?.data?.text ?? ''

    if (text.replace(/\s+/g, '').length < 18 && preparedImage !== file) {
      emit({ phase: 'recognizing', progress: 0, status: 'Erster OCR-Pass war dünn. Original-Screenshot wird zusätzlich geprüft...' })
      const fallbackResult = await worker.recognize(file)
      const fallbackText = fallbackResult?.data?.text ?? ''
      if (fallbackText.replace(/\s+/g, '').length > text.replace(/\s+/g, '').length) {
        text = fallbackText
      }
    }

    emit({ phase: 'ready', progress: 100, status: 'OCR fertig. Vorschläge können jetzt geprüft werden.' })
    return text
  }

  const recognition = recognitionChain.then(runRecognition, runRecognition)
  recognitionChain = recognition.then(() => undefined, () => undefined)
  return recognition
}

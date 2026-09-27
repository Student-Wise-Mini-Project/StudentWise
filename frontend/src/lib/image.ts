/**
 * Make a phone photo small enough to upload.
 *
 * A modern phone camera produces 4-12 MB, and the API refuses anything over
 * 5 MB. The model reading the receipt works from roughly 1500px on the long edge
 * anyway, so everything past ~2000px is bytes paid for on a mobile connection
 * and then thrown away.
 *
 * Returns the original file untouched whenever it is already small or the
 * browser cannot decode it here (no `createImageBitmap`, an unusual format):
 * the server is the one that decides whether it is an acceptable image, and a
 * failed shrink must never be the reason an upload does not happen.
 */
const MAX_EDGE = 2000
const SMALL_ENOUGH = 1.5 * 1024 * 1024

export async function shrinkImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= SMALL_ENOUGH) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  if (!blob || blob.size >= file.size) return file
  return new File([blob], 'receipt.jpg', { type: 'image/jpeg' })
}

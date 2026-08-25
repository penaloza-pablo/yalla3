export const downloadFromResponse = async (
  response: Response,
  fallbackName: string,
) => {
  const contentDisposition = response.headers.get('content-disposition') || ''
  const match = contentDisposition.match(/filename="([^"]+)"/)
  const fileName = match?.[1] ?? fallbackName
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

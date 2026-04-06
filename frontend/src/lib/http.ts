export const readJson = async <T>(response: Response): Promise<T> => {
  const raw = await response.text()

  let payload: unknown = null
  try {
    payload = raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    if (!response.ok) {
      throw new Error('Respuesta inválida del servidor')
    }
    throw new Error('No se pudo interpretar la respuesta del servidor')
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? 'mensaje' in payload && typeof payload.mensaje === 'string'
          ? payload.mensaje
          : 'message' in payload && typeof payload.message === 'string'
            ? payload.message
            : 'Error de servidor'
        : 'Error de servidor'
    throw new Error(message)
  }

  return payload as T
}

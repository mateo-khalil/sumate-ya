import type { Response } from 'express'

export const sendBadRequest = (res: Response, error: unknown, fallbackMessage: string) => {
  const message = error instanceof Error ? error.message : fallbackMessage
  return res.status(400).json({ message })
}

export const sendNotFound = (res: Response, message: string) => {
  return res.status(404).json({ message })
}

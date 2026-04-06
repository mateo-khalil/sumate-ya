export const guardElement = <T extends Element>(element: T | null, message: string): T => {
  if (!element) {
    throw new Error(message)
  }
  return element
}

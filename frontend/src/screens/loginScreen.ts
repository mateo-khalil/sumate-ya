import { guardElement } from '../lib/dom.js'
import { readJson } from '../lib/http.js'
import { sessionStore } from '../state/sessionStore.js'

interface LoginScreenOptions {
  apiBase: string
  showToast: (message: string, isError?: boolean) => void
  onSessionChanged: () => void
}

export const createLoginScreen = ({ apiBase, showToast, onSessionChanged }: LoginScreenOptions) => {
  const safeLoginRole = guardElement(document.querySelector<HTMLSelectElement>('#login-role'), 'Falta #login-role')
  const safeLoginEmail = guardElement(document.querySelector<HTMLInputElement>('#login-email'), 'Falta #login-email')
  const safeLoginPassword = guardElement(document.querySelector<HTMLInputElement>('#login-password'), 'Falta #login-password')

  const updateAuthStatus = () => {
    return
  }

  const login = async () => {
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: safeLoginRole.value,
        email: safeLoginEmail.value,
        password: safeLoginPassword.value,
      }),
    })

    const payload = await readJson<{ data: { token: string; user: { id: string; role: 'player' | 'club'; name: string; email: string } }; mensaje: string }>(response)
    sessionStore.setSession(payload.data.token, payload.data.user)
    updateAuthStatus()
    onSessionChanged()
    showToast(payload.mensaje ?? 'Login exitoso')
  }

  const bindEvents = () => {
    document.querySelector('#login-form')?.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        await login()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'No se pudo iniciar sesión', true)
      }
    })
  }

  return {
    async bootstrap() {
      await sessionStore.verifySession(apiBase)
      updateAuthStatus()
      bindEvents()
    },
    updateAuthStatus,
  }
}

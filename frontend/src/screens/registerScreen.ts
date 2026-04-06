import { guardElement } from '../lib/dom.js'
import { readJson } from '../lib/http.js'

interface RegisterScreenOptions {
  apiBase: string
  showToast: (message: string, isError?: boolean) => void
}

const parseServices = (raw: string) =>
  raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

export const createRegisterScreen = ({ apiBase, showToast }: RegisterScreenOptions) => {
  const safeLoginView = guardElement(document.querySelector<HTMLElement>('#auth-login-view'), 'Falta #auth-login-view')
  const safeRegisterPlayerView = guardElement(document.querySelector<HTMLElement>('#auth-register-player-view'), 'Falta #auth-register-player-view')
  const safeRegisterClubView = guardElement(document.querySelector<HTMLElement>('#auth-register-club-view'), 'Falta #auth-register-club-view')

  const safeRegisterPlayerForm = guardElement(document.querySelector<HTMLFormElement>('#register-player-form'), 'Falta #register-player-form')
  const safeRegisterClubForm = guardElement(document.querySelector<HTMLFormElement>('#register-club-form'), 'Falta #register-club-form')
  const safeGoRegisterPlayer = guardElement(document.querySelector<HTMLButtonElement>('#go-register-player'), 'Falta #go-register-player')
  const safeGoRegisterClub = guardElement(document.querySelector<HTMLButtonElement>('#go-register-club'), 'Falta #go-register-club')
  const safeBackToLoginFromPlayer = guardElement(
    document.querySelector<HTMLButtonElement>('#back-to-login-from-player'),
    'Falta #back-to-login-from-player'
  )
  const safeBackToLoginFromClub = guardElement(
    document.querySelector<HTMLButtonElement>('#back-to-login-from-club'),
    'Falta #back-to-login-from-club'
  )

  const showLoginView = () => {
    safeLoginView.classList.remove('hidden')
    safeRegisterPlayerView.classList.add('hidden')
    safeRegisterClubView.classList.add('hidden')
  }

  const showRegisterPlayerView = () => {
    safeLoginView.classList.add('hidden')
    safeRegisterPlayerView.classList.remove('hidden')
    safeRegisterClubView.classList.add('hidden')
  }

  const showRegisterClubView = () => {
    safeLoginView.classList.add('hidden')
    safeRegisterPlayerView.classList.add('hidden')
    safeRegisterClubView.classList.remove('hidden')
  }

  const registerPlayer = async () => {
    const name = guardElement(document.querySelector<HTMLInputElement>('#player-name'), 'Falta #player-name').value
    const email = guardElement(document.querySelector<HTMLInputElement>('#player-email'), 'Falta #player-email').value
    const phone = guardElement(document.querySelector<HTMLInputElement>('#player-phone'), 'Falta #player-phone').value
    const password = guardElement(document.querySelector<HTMLInputElement>('#player-password'), 'Falta #player-password').value

    const response = await fetch(`${apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password, role: 'player' }),
    })

    const payload = await readJson<{ mensaje: string }>(response)
    showToast(payload.mensaje)
    safeRegisterPlayerForm.reset()
    showLoginView()
  }

  const registerClub = async () => {
    const response = await fetch(`${apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'club',
        name: guardElement(document.querySelector<HTMLInputElement>('#club-name'), 'Falta #club-name').value,
        email: guardElement(document.querySelector<HTMLInputElement>('#club-email'), 'Falta #club-email').value,
        password: guardElement(document.querySelector<HTMLInputElement>('#club-password'), 'Falta #club-password').value,
        address: {
          street: guardElement(document.querySelector<HTMLInputElement>('#club-street'), 'Falta #club-street').value,
          doorNumber: guardElement(document.querySelector<HTMLInputElement>('#club-door'), 'Falta #club-door').value,
          apartment: guardElement(document.querySelector<HTMLInputElement>('#club-apartment'), 'Falta #club-apartment').value,
          city: guardElement(document.querySelector<HTMLInputElement>('#club-city'), 'Falta #club-city').value,
          department: guardElement(document.querySelector<HTMLInputElement>('#club-department'), 'Falta #club-department').value,
          zipCode: guardElement(document.querySelector<HTMLInputElement>('#club-zip'), 'Falta #club-zip').value,
        },
        servicesOffered: parseServices(
          guardElement(document.querySelector<HTMLInputElement>('#club-services'), 'Falta #club-services').value
        ),
      }),
    })

    const payload = await readJson<{ mensaje: string }>(response)
    showToast(payload.mensaje)
    safeRegisterClubForm.reset()
    showLoginView()
  }

  return {
    bootstrap() {
      safeRegisterPlayerForm.addEventListener('submit', async (event) => {
        event.preventDefault()
        try {
          await registerPlayer()
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'No se pudo registrar jugador', true)
        }
      })

      safeRegisterClubForm.addEventListener('submit', async (event) => {
        event.preventDefault()
        try {
          await registerClub()
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'No se pudo registrar club', true)
        }
      })

      showLoginView()

      safeGoRegisterPlayer.addEventListener('click', () => {
        showRegisterPlayerView()
      })

      safeGoRegisterClub.addEventListener('click', () => {
        showRegisterClubView()
      })

      safeBackToLoginFromPlayer.addEventListener('click', () => {
        showLoginView()
      })

      safeBackToLoginFromClub.addEventListener('click', () => {
        showLoginView()
      })
    },
  }
}

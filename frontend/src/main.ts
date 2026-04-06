import { guardElement } from './lib/dom.js'
import { createHomeScreen } from './screens/homeScreen.js'
import { createLoginScreen } from './screens/loginScreen.js'
import { createRegisterScreen } from './screens/registerScreen.js'
import { sessionStore } from './state/sessionStore.js'

const apiBase = 'http://localhost:4000/api'

const safeToast = guardElement(document.querySelector<HTMLDivElement>('#toast'), 'Falta #toast')
const safeAuthScreen = guardElement(document.querySelector<HTMLElement>('#auth-screen'), 'Falta #auth-screen')
const safeHomeScreen = guardElement(document.querySelector<HTMLElement>('#home-screen'), 'Falta #home-screen')
const safeHeaderMenuToggle = guardElement(document.querySelector<HTMLButtonElement>('#header-menu-toggle'), 'Falta #header-menu-toggle')
const safeHeaderMenu = guardElement(document.querySelector<HTMLDivElement>('#header-menu'), 'Falta #header-menu')
const safeHeaderLogout = guardElement(document.querySelector<HTMLButtonElement>('#header-logout'), 'Falta #header-logout')

const showToast = (message: string, isError = false) => {
  safeToast.textContent = message
  safeToast.style.background = isError ? '#b42318' : '#101828'
  safeToast.classList.add('show')
  setTimeout(() => safeToast.classList.remove('show'), 2500)
}

const syncVisibleScreen = () => {
  const authenticated = Boolean(sessionStore.getUser())
  safeAuthScreen.classList.toggle('screen-hidden', authenticated)
  safeHomeScreen.classList.toggle('screen-hidden', !authenticated)
  safeHeaderMenuToggle.classList.toggle('hidden', !authenticated)
  if (!authenticated) {
    safeHeaderMenu.classList.add('hidden')
  }
}

const homeScreen = createHomeScreen({ apiBase, showToast })
const loginScreen = createLoginScreen({
  apiBase,
  showToast,
  onSessionChanged: () => {
    loginScreen.updateAuthStatus()
    syncVisibleScreen()
  },
})
const registerScreen = createRegisterScreen({ apiBase, showToast })

const bootstrap = async () => {
  await loginScreen.bootstrap()
  registerScreen.bootstrap()
  await homeScreen.bootstrap()
  syncVisibleScreen()

  safeHeaderLogout.addEventListener('click', () => {
    sessionStore.clearSession()
    loginScreen.updateAuthStatus()
    syncVisibleScreen()
    showToast('Sesión cerrada')
  })
}

bootstrap().catch((error) => {
  showToast(error instanceof Error ? error.message : 'Error al iniciar la app', true)
})

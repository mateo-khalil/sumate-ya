import { guardElement } from '../lib/dom.js'
import { readJson } from '../lib/http.js'
import { sessionStore } from '../state/sessionStore.js'
import type { Club, Match, MatchFormat, TeamOption, Tournament } from '../types.js'

interface HomeScreenOptions {
  apiBase: string
  showToast: (message: string, isError?: boolean) => void
}

export const createHomeScreen = ({ apiBase, showToast }: HomeScreenOptions) => {
  const safeHomeActionsCard = guardElement(document.querySelector<HTMLElement>('.home-actions-card'), 'Falta .home-actions-card')
  const safePanelCreateMatch = guardElement(document.querySelector<HTMLElement>('#panel-create-match'), 'Falta #panel-create-match')
  const safePanelViewMatches = guardElement(document.querySelector<HTMLElement>('#panel-view-matches'), 'Falta #panel-view-matches')
  const safePanelViewTournaments = guardElement(
    document.querySelector<HTMLElement>('#panel-view-tournaments'),
    'Falta #panel-view-tournaments'
  )
  const safePanelCreateTournament = guardElement(
    document.querySelector<HTMLElement>('#panel-create-tournament'),
    'Falta #panel-create-tournament'
  )
  const safePanelProfile = guardElement(document.querySelector<HTMLElement>('#panel-profile'), 'Falta #panel-profile')
  const safePanelMyActivity = guardElement(document.querySelector<HTMLElement>('#panel-my-activity'), 'Falta #panel-my-activity')

  const safeHeaderMenuToggle = guardElement(
    document.querySelector<HTMLButtonElement>('#header-menu-toggle'),
    'Falta #header-menu-toggle'
  )
  const safeHeaderMenu = guardElement(document.querySelector<HTMLDivElement>('#header-menu'), 'Falta #header-menu')
  const safeMenuProfile = guardElement(document.querySelector<HTMLButtonElement>('#menu-profile'), 'Falta #menu-profile')
  const safeMenuMyActivity = guardElement(
    document.querySelector<HTMLButtonElement>('#menu-my-activity'),
    'Falta #menu-my-activity'
  )

  const safeGoViewMatches = guardElement(document.querySelector<HTMLButtonElement>('#go-view-matches'), 'Falta #go-view-matches')
  const safeGoViewTournaments = guardElement(
    document.querySelector<HTMLButtonElement>('#go-view-tournaments'),
    'Falta #go-view-tournaments'
  )
  const safeGoCreateMatch = guardElement(document.querySelector<HTMLButtonElement>('#go-create-match'), 'Falta #go-create-match')
  const safeGoCreateTournament = guardElement(
    document.querySelector<HTMLButtonElement>('#go-create-tournament'),
    'Falta #go-create-tournament'
  )

  const safeBackFromCreateMatch = guardElement(
    document.querySelector<HTMLButtonElement>('#back-from-create-match'),
    'Falta #back-from-create-match'
  )
  const safeBackFromViewMatches = guardElement(
    document.querySelector<HTMLButtonElement>('#back-from-view-matches'),
    'Falta #back-from-view-matches'
  )
  const safeBackFromViewTournaments = guardElement(
    document.querySelector<HTMLButtonElement>('#back-from-view-tournaments'),
    'Falta #back-from-view-tournaments'
  )
  const safeBackFromCreateTournament = guardElement(
    document.querySelector<HTMLButtonElement>('#back-from-create-tournament'),
    'Falta #back-from-create-tournament'
  )
  const safeBackFromProfile = guardElement(document.querySelector<HTMLButtonElement>('#back-from-profile'), 'Falta #back-from-profile')
  const safeBackFromMyActivity = guardElement(
    document.querySelector<HTMLButtonElement>('#back-from-my-activity'),
    'Falta #back-from-my-activity'
  )

  const safeMatchesList = guardElement(document.querySelector<HTMLDivElement>('#matches-list'), 'Falta #matches-list')
  const safeMatchDetail = guardElement(document.querySelector<HTMLDivElement>('#match-detail'), 'Falta #match-detail')
  const safeTournamentsList = guardElement(document.querySelector<HTMLDivElement>('#tournaments-list'), 'Falta #tournaments-list')
  const safeProfileContent = guardElement(document.querySelector<HTMLDivElement>('#profile-content'), 'Falta #profile-content')
  const safeMyActivityContent = guardElement(document.querySelector<HTMLDivElement>('#my-activity-content'), 'Falta #my-activity-content')

  const safeZoneFilter = guardElement(document.querySelector<HTMLInputElement>('#zone-filter'), 'Falta #zone-filter')
  const safeFormatFilter = guardElement(document.querySelector<HTMLSelectElement>('#format-filter'), 'Falta #format-filter')
  const safeHourFilter = guardElement(document.querySelector<HTMLInputElement>('#hour-filter'), 'Falta #hour-filter')

  const safeClubSelect = guardElement(document.querySelector<HTMLSelectElement>('#club-select'), 'Falta #club-select')
  const safeSlotSelect = guardElement(document.querySelector<HTMLSelectElement>('#slot-select'), 'Falta #slot-select')
  const safeFormatSelect = guardElement(document.querySelector<HTMLSelectElement>('#format-select'), 'Falta #format-select')
  const safeCapacityInput = guardElement(document.querySelector<HTMLInputElement>('#capacity-input'), 'Falta #capacity-input')

  const safeTournamentClub = guardElement(document.querySelector<HTMLSelectElement>('#tournament-club'), 'Falta #tournament-club')
  const safeTournamentSlot = guardElement(document.querySelector<HTMLSelectElement>('#tournament-slot'), 'Falta #tournament-slot')
  const safeTournamentFormat = guardElement(document.querySelector<HTMLSelectElement>('#tournament-format'), 'Falta #tournament-format')
  const safePlayersPerTeamInput = guardElement(document.querySelector<HTMLInputElement>('#players-per-team'), 'Falta #players-per-team')

  let clubs: Club[] = []
  let matches: Match[] = []
  let tournaments: Tournament[] = []
  let selectedMatchId: string | null = null

  type HomePanel = 'actions' | 'view-matches' | 'view-tournaments' | 'create-match' | 'create-tournament' | 'profile' | 'my-activity'

  const hideAllPanels = () => {
    safePanelCreateMatch.classList.add('hidden')
    safePanelViewMatches.classList.add('hidden')
    safePanelViewTournaments.classList.add('hidden')
    safePanelCreateTournament.classList.add('hidden')
    safePanelProfile.classList.add('hidden')
    safePanelMyActivity.classList.add('hidden')
  }

  const showMenu = () => {
    safeHeaderMenu.classList.remove('hidden')
  }

  const hideMenu = () => {
    safeHeaderMenu.classList.add('hidden')
  }

  const showPanel = async (panel: HomePanel) => {
    hideMenu()
    hideAllPanels()
    safeHomeActionsCard.classList.toggle('hidden', panel !== 'actions')

    if (panel === 'actions') {
      return
    }

    if (panel === 'view-matches') {
      await reloadMatches()
      safePanelViewMatches.classList.remove('hidden')
      return
    }

    if (panel === 'view-tournaments') {
      await fetchTournaments()
      renderTournaments()
      safePanelViewTournaments.classList.remove('hidden')
      return
    }

    if (panel === 'create-match') {
      safePanelCreateMatch.classList.remove('hidden')
      return
    }

    if (panel === 'create-tournament') {
      safePanelCreateTournament.classList.remove('hidden')
      return
    }

    if (panel === 'profile') {
      renderProfile()
      safePanelProfile.classList.remove('hidden')
      return
    }

    await fetchMatches()
    await fetchTournaments()
    renderMyActivity()
    safePanelMyActivity.classList.remove('hidden')
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('es-UY', {
      dateStyle: 'short',
      timeStyle: 'short',
    })

  const fetchClubs = async () => {
    const response = await fetch(`${apiBase}/clubs`)
    clubs = await readJson<Club[]>(response)
  }

  const fetchSlots = async (clubId: string) => {
    const response = await fetch(`${apiBase}/clubs/${clubId}/slots`)
    return readJson<string[]>(response)
  }

  const fetchMatches = async () => {
    const params = new URLSearchParams()
    if (safeZoneFilter.value.trim()) params.set('zone', safeZoneFilter.value.trim())
    if (safeFormatFilter.value) params.set('format', safeFormatFilter.value)
    if (safeHourFilter.value.trim()) params.set('hour', safeHourFilter.value.trim())

    const query = params.toString()
    const response = await fetch(`${apiBase}/matches${query ? `?${query}` : ''}`)
    matches = await readJson<Match[]>(response)
  }

  const fetchTournaments = async () => {
    const response = await fetch(`${apiBase}/tournaments`)
    tournaments = await readJson<Tournament[]>(response)
  }

  const refreshSlotsForCreate = async (clubId: string) => {
    const slots = await fetchSlots(clubId)
    safeSlotSelect.innerHTML = slots.map((slot) => `<option value="${slot}">${formatDate(slot)}</option>`).join('')
  }

  const refreshSlotsForTournament = async (clubId: string) => {
    const slots = await fetchSlots(clubId)
    safeTournamentSlot.innerHTML = slots.map((slot) => `<option value="${slot}">${formatDate(slot)}</option>`).join('')
  }

  const renderClubOptions = async () => {
    const options = clubs.map((club) => `<option value="${club.id}">${club.name} (${club.zone})</option>`).join('')
    safeClubSelect.innerHTML = options
    safeTournamentClub.innerHTML = options

    if (clubs.length > 0) {
      await refreshSlotsForCreate(clubs[0].id)
      await refreshSlotsForTournament(clubs[0].id)
    }
  }

  const renderMatches = () => {
    if (matches.length === 0) {
      safeMatchesList.innerHTML = '<p>No hay partidos próximos. ¡Creá uno nuevo!</p>'
      return
    }

    safeMatchesList.innerHTML = matches
      .map((match) => {
        const remaining = Math.max(match.capacity - match.participants.length, 0)
        return `
        <article class="match-card">
          <strong>${match.clubName} · ${formatDate(match.slot)}</strong>
          <span class="match-meta">Formato ${match.format} · Cupos restantes: ${remaining}</span>
          <button data-select-match="${match.id}" class="secondary">Ver detalle</button>
        </article>
      `
      })
      .join('')
  }

  const renderTournaments = () => {
    if (tournaments.length === 0) {
      safeTournamentsList.innerHTML = '<p>No hay torneos creados todavía.</p>'
      return
    }

    safeTournamentsList.innerHTML = tournaments
      .map((tournament) => {
        const firstSlot = tournament.scheduleSlots[0] ? formatDate(tournament.scheduleSlots[0]) : 'Sin horario'
        return `
        <article class="match-card">
          <strong>${tournament.name} · ${tournament.clubName}</strong>
          <span class="match-meta">Formato ${tournament.format} · Equipos: ${tournament.teamCount} · Inicio: ${firstSlot}</span>
        </article>
      `
      })
      .join('')
  }

  const renderProfile = () => {
    const user = sessionStore.getUser()
    if (!user) {
      safeProfileContent.textContent = 'No hay sesión activa.'
      return
    }

    safeProfileContent.innerHTML = `
      <p><strong>Nombre:</strong> ${user.name}</p>
      <p><strong>Email:</strong> ${user.email}</p>
      <p><strong>Rol:</strong> ${user.role}</p>
    `
  }

  const renderMyActivity = () => {
    const user = sessionStore.getUser()
    if (!user) {
      safeMyActivityContent.textContent = 'No hay sesión activa.'
      return
    }

    const joinedMatches = matches.filter((match) => match.participants.some((participant) => participant.playerId === user.id))
    const userTournaments = tournaments.filter((tournament) => tournament.organizerId === user.id)

    const joinedMatchesHtml =
      joinedMatches.length === 0
        ? '<li>No estás anotado en partidos todavía.</li>'
        : joinedMatches.map((match) => `<li>${match.clubName} · ${formatDate(match.slot)} · Formato ${match.format}</li>`).join('')

    const tournamentsHtml =
      userTournaments.length === 0
        ? '<li>No tenés torneos registrados.</li>'
        : userTournaments.map((tournament) => `<li>${tournament.name} · ${tournament.clubName} · Formato ${tournament.format}</li>`).join('')

    safeMyActivityContent.innerHTML = `
      <div>
        <h3>Partidos anotados</h3>
        <ul class="participants">${joinedMatchesHtml}</ul>
      </div>
      <div>
        <h3>Torneos</h3>
        <ul class="participants">${tournamentsHtml}</ul>
      </div>
    `
  }

  const reloadMatches = async (matchId?: string) => {
    await fetchMatches()
    if (matchId) {
      selectedMatchId = matchId
    }
    renderMatches()
    renderMatchDetail()
  }

  const joinMatch = async (matchId: string, teamValue: TeamOption | '') => {
    const session = sessionStore.requireAuth()
    const response = await fetch(`${apiBase}/matches/${matchId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionStore.authHeaders() },
      body: JSON.stringify({ playerId: session.id, name: session.name, team: teamValue || undefined }),
    })

    const payload = await readJson<{ message: string }>(response)
    showToast(payload.message)
    await reloadMatches(matchId)
  }

  const selectTeam = async (matchId: string, teamValue: TeamOption | '') => {
    const session = sessionStore.requireAuth()
    if (!teamValue) {
      showToast('Seleccioná un equipo antes de confirmar.', true)
      return
    }

    const response = await fetch(`${apiBase}/matches/${matchId}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionStore.authHeaders() },
      body: JSON.stringify({ playerId: session.id, team: teamValue }),
    })

    const payload = await readJson<{ message: string }>(response)
    showToast(payload.message)
    await reloadMatches(matchId)
  }

  const leaveMatch = async (matchId: string) => {
    const session = sessionStore.requireAuth()
    const confirmed = window.confirm('¿Seguro que querés salirte del partido?')
    if (!confirmed) {
      return
    }

    const response = await fetch(`${apiBase}/matches/${matchId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionStore.authHeaders() },
      body: JSON.stringify({ playerId: session.id, now: new Date().toISOString() }),
    })

    const payload = await readJson<{ message: string }>(response)
    showToast(payload.message)
    await reloadMatches(matchId)
  }

  const renderMatchDetail = () => {
    if (!selectedMatchId) {
      safeMatchDetail.innerHTML = 'Seleccioná un partido para ver su detalle.'
      return
    }

    const match = matches.find((item) => item.id === selectedMatchId)
    if (!match) {
      safeMatchDetail.innerHTML = 'El partido seleccionado ya no está disponible.'
      return
    }

    const user = sessionStore.getUser()
    const isJoined = user ? match.participants.some((item) => item.playerId === user.id) : false
    const remaining = Math.max(match.capacity - match.participants.length, 0)

    safeMatchDetail.innerHTML = `
      <div>
        <strong>${match.clubName}</strong>
        <p>${formatDate(match.slot)} · Formato ${match.format}</p>
        <p>Organizador: ${match.organizerName}</p>
        <p>Cupos restantes: ${remaining}</p>
        <p>Cancha: Principal · Ubicación: ${match.zone}</p>
        <label>
          Equipo
          <select id="team-select">
            <option value="">Sin equipo</option>
            <option value="A">Equipo A</option>
            <option value="B">Equipo B</option>
          </select>
        </label>
        <div class="actions">
          <button id="join-match">Sumarme</button>
          <button id="choose-team" class="secondary">Seleccionar equipo</button>
          <button id="leave-match" class="danger">Salirme del partido</button>
        </div>
        <ul class="participants">
          ${match.participants.map((participant) => `<li>${participant.name}${participant.team ? ` · Equipo ${participant.team}` : ''}</li>`).join('')}
        </ul>
        <p>${isJoined ? 'Ya estás inscripto en este partido.' : 'Aún no estás inscripto en este partido.'}</p>
      </div>
    `

    const joinButton = document.querySelector<HTMLButtonElement>('#join-match')
    const teamButton = document.querySelector<HTMLButtonElement>('#choose-team')
    const leaveButton = document.querySelector<HTMLButtonElement>('#leave-match')
    const teamSelect = document.querySelector<HTMLSelectElement>('#team-select')

    joinButton?.addEventListener('click', () => void joinMatch(match.id, (teamSelect?.value ?? '') as TeamOption | ''))
    teamButton?.addEventListener('click', () => void selectTeam(match.id, (teamSelect?.value ?? '') as TeamOption | ''))
    leaveButton?.addEventListener('click', () => void leaveMatch(match.id))
  }

  const createMatch = async () => {
    const session = sessionStore.requireAuth()
    const payload = {
      organizerId: session.id,
      organizerName: session.name,
      clubId: safeClubSelect.value,
      slot: safeSlotSelect.value,
      format: Number(safeFormatSelect.value) as MatchFormat,
      capacity: Number(safeCapacityInput.value),
      invitedPlayerIds: [],
    }

    const response = await fetch(`${apiBase}/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionStore.authHeaders() },
      body: JSON.stringify(payload),
    })

    await readJson<{ message: string }>(response)
    showToast('Partido creado y publicado.')
    await reloadMatches()
  }

  const createTournament = async () => {
    const session = sessionStore.requireAuth()
    const nameInput = guardElement(document.querySelector<HTMLInputElement>('#tournament-name'), 'Falta #tournament-name')
    const teamCountInput = guardElement(document.querySelector<HTMLInputElement>('#team-count'), 'Falta #team-count')

    const payload = {
      organizerId: session.id,
      name: nameInput.value,
      format: Number(safeTournamentFormat.value) as MatchFormat,
      teamCount: Number(teamCountInput.value),
      playersPerTeam: Number(safePlayersPerTeamInput.value),
      clubId: safeTournamentClub.value,
      scheduleSlots: [safeTournamentSlot.value],
    }

    const response = await fetch(`${apiBase}/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionStore.authHeaders() },
      body: JSON.stringify(payload),
    })

    await readJson<{ message: string }>(response)
    showToast('Torneo creado correctamente.')
    await fetchTournaments()
    renderTournaments()
  }

  const handleAutoSuggestion = async () => {
    const response = await fetch(`${apiBase}/tournaments/suggestions/${safeTournamentFormat.value}`)
    const payload = await readJson<{ playersPerTeam: number }>(response)
    safePlayersPerTeamInput.value = String(payload.playersPerTeam)
  }

  const bindEvents = () => {
    safeHeaderMenuToggle.addEventListener('click', (event) => {
      event.stopPropagation()
      if (safeHeaderMenu.classList.contains('hidden')) {
        showMenu()
        return
      }
      hideMenu()
    })

    document.addEventListener('click', (event) => {
      const target = event.target as Node
      if (!safeHeaderMenu.contains(target) && !safeHeaderMenuToggle.contains(target)) {
        hideMenu()
      }
    })

    safeMenuProfile.addEventListener('click', () => {
      void showPanel('profile')
    })

    safeMenuMyActivity.addEventListener('click', () => {
      void showPanel('my-activity')
    })

    safeGoViewMatches.addEventListener('click', () => {
      void showPanel('view-matches')
    })

    safeGoViewTournaments.addEventListener('click', () => {
      void showPanel('view-tournaments')
    })

    safeGoCreateMatch.addEventListener('click', () => {
      void showPanel('create-match')
    })

    safeGoCreateTournament.addEventListener('click', () => {
      void showPanel('create-tournament')
    })

    safeBackFromCreateMatch.addEventListener('click', () => {
      void showPanel('actions')
    })

    safeBackFromViewMatches.addEventListener('click', () => {
      void showPanel('actions')
    })

    safeBackFromViewTournaments.addEventListener('click', () => {
      void showPanel('actions')
    })

    safeBackFromCreateTournament.addEventListener('click', () => {
      void showPanel('actions')
    })

    safeBackFromProfile.addEventListener('click', () => {
      void showPanel('actions')
    })

    safeBackFromMyActivity.addEventListener('click', () => {
      void showPanel('actions')
    })

    document.querySelector('#create-match-form')?.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        await createMatch()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'No se pudo crear partido', true)
      }
    })

    document.querySelector('#create-tournament-form')?.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        await createTournament()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'No se pudo crear torneo', true)
      }
    })

    document.querySelector('#filter-form')?.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        await reloadMatches()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'No se pudieron aplicar filtros', true)
      }
    })

    safeMatchesList.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      const matchId = target.getAttribute('data-select-match')
      if (!matchId) {
        return
      }
      selectedMatchId = matchId
      renderMatchDetail()
    })

    safeClubSelect.addEventListener('change', async () => {
      try {
        await refreshSlotsForCreate(safeClubSelect.value)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'No se pudieron cargar horarios', true)
      }
    })

    safeTournamentClub.addEventListener('change', async () => {
      try {
        await refreshSlotsForTournament(safeTournamentClub.value)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'No se pudieron cargar horarios', true)
      }
    })

    safeTournamentFormat.addEventListener('change', async () => {
      try {
        await handleAutoSuggestion()
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'No se pudo cargar sugerencia', true)
      }
    })
  }

  return {
    async bootstrap() {
      await fetchClubs()
      await renderClubOptions()
      await fetchMatches()
      await fetchTournaments()
      renderMatches()
      renderTournaments()
      bindEvents()
      await showPanel('actions')
    },
  }
}

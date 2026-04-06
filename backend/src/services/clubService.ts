import { clubRepository } from '../repositories/clubRepository.js'

export const clubService = {
  async list() {
    return clubRepository.findAll()
  },

  async listSlots(clubId: string) {
    const club = await clubRepository.findById(clubId)
    if (!club) {
      throw new Error('Club no encontrado')
    }
    return club.availableSlots
  },
}

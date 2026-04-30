import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  createAnonClient: vi.fn(),
  createUserClient: vi.fn(),
  supabase: {
    auth: {
      admin: {
        createUser: supabaseMock.createUser,
        deleteUser: supabaseMock.deleteUser,
      },
      refreshSession: vi.fn(),
    },
    from: supabaseMock.from,
  },
}));

vi.mock('./emailService.js', () => ({
  emailService: {
    sendWelcomeEmail: vi.fn(),
  },
}));

import { authService } from './authService.js';

describe('authService.registerPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.createUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'mateo@example.com' } },
      error: null,
    });
    supabaseMock.deleteUser.mockResolvedValue({ error: null });
    supabaseMock.insert.mockResolvedValue({ error: null });
    supabaseMock.from.mockReturnValue({ insert: supabaseMock.insert });
  });

  it('creates a Supabase Auth user and a player profile', async () => {
    await authService.registerPlayer({
      displayName: 'Mateo Duran',
      email: 'mateo@example.com',
      password: 'Hola12345',
    });

    expect(supabaseMock.createUser).toHaveBeenCalledWith({
      email: 'mateo@example.com',
      password: 'Hola12345',
      user_metadata: { nombre: 'Mateo Duran' },
      email_confirm: true,
    });
    expect(supabaseMock.from).toHaveBeenCalledTimes(1);
    expect(supabaseMock.from).toHaveBeenCalledWith('profiles');
    expect(supabaseMock.insert).toHaveBeenCalledWith({
      id: 'user-123',
      displayName: 'Mateo Duran',
      role: 'player',
      matchesPlayed: 0,
      matchesWon: 0,
      isPublic: true,
    });
  });

  it('does not create a profile when Supabase Auth rejects the email as duplicate', async () => {
    supabaseMock.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'User already exists' },
    });

    await expect(
      authService.registerPlayer({
        displayName: 'Mateo Duran',
        email: 'mateo@example.com',
        password: 'Hola12345',
      }),
    ).rejects.toThrow('User already registered');

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(supabaseMock.insert).not.toHaveBeenCalled();
  });

  it('surfaces provider password errors before profile creation', async () => {
    supabaseMock.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Password should contain more character classes' },
    });

    await expect(
      authService.registerPlayer({
        displayName: 'Mateo Duran',
        email: 'mateo@example.com',
        password: 'password1',
      }),
    ).rejects.toThrow('Password should contain more character classes');

    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('rolls back the auth user when profile creation fails', async () => {
    supabaseMock.insert.mockResolvedValueOnce({
      error: { message: 'duplicate key value violates unique constraint' },
    });

    await expect(
      authService.registerPlayer({
        displayName: 'Mateo Duran',
        email: 'mateo@example.com',
        password: 'Hola12345',
      }),
    ).rejects.toThrow('Error al crear el perfil: duplicate key value violates unique constraint');

    expect(supabaseMock.deleteUser).toHaveBeenCalledWith('user-123');
  });

  it('fails before profile creation when Supabase does not return a user', async () => {
    supabaseMock.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    await expect(
      authService.registerPlayer({
        displayName: 'Mateo Duran',
        email: 'mateo@example.com',
        password: 'Hola12345',
      }),
    ).rejects.toThrow('No se pudo crear el usuario. Intentá de nuevo.');

    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});

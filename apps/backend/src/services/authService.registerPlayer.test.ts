import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  createAnonClient: vi.fn(),
  createUserClient: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithIdToken: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  from: vi.fn(),
  userFrom: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));

vi.mock('../config/supabase.js', () => ({
  createAnonClient: supabaseMock.createAnonClient,
  createUserClient: supabaseMock.createUserClient,
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
    supabaseMock.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    supabaseMock.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'mateo@example.com' } },
      error: null,
    });
    supabaseMock.updateUser.mockResolvedValue({ data: {}, error: null });
    supabaseMock.createAnonClient.mockReturnValue({
      auth: {
        signInWithPassword: supabaseMock.signInWithPassword,
        signInWithIdToken: supabaseMock.signInWithIdToken,
      },
    });
    supabaseMock.createUserClient.mockReturnValue({
      auth: {
        getUser: supabaseMock.getUser,
        updateUser: supabaseMock.updateUser,
      },
      from: supabaseMock.userFrom,
    });
    supabaseMock.insert.mockResolvedValue({ error: null });
    supabaseMock.upsert.mockResolvedValue({ error: null });
    supabaseMock.single.mockResolvedValue({
      data: { role: 'player', displayName: 'Mateo Google' },
      error: null,
    });
    supabaseMock.eq.mockReturnValue({ single: supabaseMock.single });
    supabaseMock.select.mockReturnValue({ eq: supabaseMock.eq });
    supabaseMock.userFrom.mockReturnValue({ select: supabaseMock.select });
    supabaseMock.from.mockReturnValue({
      insert: supabaseMock.insert,
      upsert: supabaseMock.upsert,
    });
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

describe('authService.loginWithGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.signInWithIdToken.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-google',
          refresh_token: 'refresh-google',
        },
        user: {
          id: 'google-user-123',
          email: 'mateo@gmail.com',
          user_metadata: {
            full_name: 'Mateo Google',
            avatar_url: 'https://lh3.googleusercontent.com/avatar.png',
          },
        },
      },
      error: null,
    });
    supabaseMock.createAnonClient.mockReturnValue({
      auth: {
        signInWithPassword: supabaseMock.signInWithPassword,
        signInWithIdToken: supabaseMock.signInWithIdToken,
      },
    });
    supabaseMock.createUserClient.mockReturnValue({
      auth: {
        getUser: supabaseMock.getUser,
        updateUser: supabaseMock.updateUser,
      },
      from: supabaseMock.userFrom,
    });
    supabaseMock.upsert.mockResolvedValue({ error: null });
    supabaseMock.single.mockResolvedValue({
      data: { role: 'player', displayName: 'Mateo Google' },
      error: null,
    });
    supabaseMock.eq.mockReturnValue({ single: supabaseMock.single });
    supabaseMock.select.mockReturnValue({ eq: supabaseMock.eq });
    supabaseMock.userFrom.mockReturnValue({ select: supabaseMock.select });
    supabaseMock.from.mockReturnValue({ upsert: supabaseMock.upsert });
  });

  it('exchanges the Google ID token and returns the existing session shape', async () => {
    const result = await authService.loginWithGoogle('google-id-token');

    expect(supabaseMock.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'google-id-token',
    });
    expect(supabaseMock.createUserClient).toHaveBeenCalledWith('access-google');
    expect(result).toEqual({
      accessToken: 'access-google',
      refreshToken: 'refresh-google',
      user: {
        id: 'google-user-123',
        email: 'mateo@gmail.com',
        displayName: 'Mateo Google',
        role: 'player',
      },
    });
  });

  it('creates a default player profile without overwriting an existing profile', async () => {
    await authService.loginWithGoogle('google-id-token');

    expect(supabaseMock.from).toHaveBeenCalledWith('profiles');
    expect(supabaseMock.upsert).toHaveBeenCalledWith(
      {
        id: 'google-user-123',
        displayName: 'Mateo Google',
        avatarUrl: 'https://lh3.googleusercontent.com/avatar.png',
        role: 'player',
        matchesPlayed: 0,
        matchesWon: 0,
        isPublic: true,
      },
      {
        onConflict: 'id',
        ignoreDuplicates: true,
      },
    );
    expect(supabaseMock.userFrom).toHaveBeenCalledWith('profiles');
    expect(supabaseMock.select).toHaveBeenCalledWith('role, displayName');
    expect(supabaseMock.eq).toHaveBeenCalledWith('id', 'google-user-123');
  });

  it('preserves the role resolved from the existing profile', async () => {
    supabaseMock.single.mockResolvedValueOnce({
      data: { role: 'club_admin', displayName: 'Admin Club' },
      error: null,
    });

    const result = await authService.loginWithGoogle('google-id-token');

    expect(result.user.role).toBe('club_admin');
    expect(result.user.displayName).toBe('Admin Club');
  });

  it('rejects invalid Google credentials', async () => {
    supabaseMock.signInWithIdToken.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: 'invalid JWT' },
    });

    await expect(authService.loginWithGoogle('bad-token')).rejects.toThrow(
      'Invalid Google credentials',
    );
    expect(supabaseMock.upsert).not.toHaveBeenCalled();
  });

  it('surfaces profile creation failures', async () => {
    supabaseMock.upsert.mockResolvedValueOnce({
      error: { message: 'insert violates profiles policy' },
    });

    await expect(authService.loginWithGoogle('google-id-token')).rejects.toThrow(
      'Error al crear el perfil: insert violates profiles policy',
    );
  });
});

describe('authService.changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    supabaseMock.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'mateo@example.com' } },
      error: null,
    });
    supabaseMock.updateUser.mockResolvedValue({ data: {}, error: null });
    supabaseMock.createAnonClient.mockReturnValue({
      auth: { signInWithPassword: supabaseMock.signInWithPassword },
    });
    supabaseMock.createUserClient.mockReturnValue({
      auth: {
        getUser: supabaseMock.getUser,
        updateUser: supabaseMock.updateUser,
      },
    });
  });

  it('verifies the current password and updates the Supabase Auth password', async () => {
    await authService.changePassword({
      accessToken: 'token-123',
      currentPassword: 'Actual123',
      newPassword: 'Nueva1234',
    });

    expect(supabaseMock.createUserClient).toHaveBeenCalledWith('token-123');
    expect(supabaseMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'mateo@example.com',
      password: 'Actual123',
    });
    expect(supabaseMock.updateUser).toHaveBeenCalledWith({ password: 'Nueva1234' });
  });

  it('does not update when the current password is invalid', async () => {
    supabaseMock.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: 'Invalid login credentials' },
    });

    await expect(
      authService.changePassword({
        accessToken: 'token-123',
        currentPassword: 'Mal12345',
        newPassword: 'Nueva1234',
      }),
    ).rejects.toThrow('Current password is incorrect');

    expect(supabaseMock.updateUser).not.toHaveBeenCalled();
  });

  it('fails when the access token is invalid', async () => {
    supabaseMock.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'JWT expired' },
    });

    await expect(
      authService.changePassword({
        accessToken: 'expired',
        currentPassword: 'Actual123',
        newPassword: 'Nueva1234',
      }),
    ).rejects.toThrow('Invalid or expired token');

    expect(supabaseMock.signInWithPassword).not.toHaveBeenCalled();
    expect(supabaseMock.updateUser).not.toHaveBeenCalled();
  });
});

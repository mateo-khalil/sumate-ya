import { beforeEach, describe, expect, it, vi } from 'vitest';

const authServiceMock = vi.hoisted(() => ({
  registerPlayer: vi.fn(),
}));

vi.mock('../services/authService.js', () => ({
  authService: authServiceMock,
}));

import { authController } from './authController.js';

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createResponse(): MockResponse {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

async function registerPlayer(body: unknown): Promise<MockResponse> {
  const res = createResponse();
  await authController.registerPlayer({ body } as never, res as never);
  return res;
}

describe('authController.registerPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.registerPlayer.mockResolvedValue(undefined);
  });

  it('validates the player signup payload and creates the user through the service', async () => {
    const res = await registerPlayer({
      displayName: 'Mateo Duran',
      email: 'mateo@example.com',
      password: 'Hola12345',
      confirmPassword: 'Hola12345',
    });

    expect(authServiceMock.registerPlayer).toHaveBeenCalledWith({
      displayName: 'Mateo Duran',
      email: 'mateo@example.com',
      password: 'Hola12345',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Registro exitoso. Ya podés iniciar sesión.',
    });
  });

  it('returns field errors for invalid email and short password without calling Supabase', async () => {
    const res = await registerPlayer({
      displayName: 'M',
      email: 'no-es-email',
      password: '1234567',
      confirmPassword: '',
    });

    expect(authServiceMock.registerPlayer).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Datos inválidos',
      errors: {
        displayName: 'Nombre completo requerido (mínimo 2 caracteres)',
        email: 'Email inválido',
        password: 'La contraseña debe tener al menos 8 caracteres',
        confirmPassword: 'Confirmá tu contraseña',
      },
    });
  });

  it('returns a confirmPassword field error when passwords do not match', async () => {
    const res = await registerPlayer({
      displayName: 'Mateo Duran',
      email: 'mateo@example.com',
      password: 'Hola12345',
      confirmPassword: 'Otra12345',
    });

    expect(authServiceMock.registerPlayer).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Datos inválidos',
      errors: { confirmPassword: 'Las contraseñas no coinciden' },
    });
  });

  it('maps duplicate email errors to the email field', async () => {
    authServiceMock.registerPlayer.mockRejectedValueOnce(new Error('User already registered'));

    const res = await registerPlayer({
      displayName: 'Mateo Duran',
      email: 'mateo@example.com',
      password: 'Hola12345',
      confirmPassword: 'Hola12345',
    });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Datos inválidos',
      errors: { email: 'Este email ya está registrado' },
    });
  });

  it('maps provider password errors to a password field error', async () => {
    authServiceMock.registerPlayer.mockRejectedValueOnce(
      new Error('Password should contain more character classes'),
    );

    const res = await registerPlayer({
      displayName: 'Mateo Duran',
      email: 'mateo@example.com',
      password: 'password1',
      confirmPassword: 'password1',
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Datos inválidos',
      errors: { password: 'La contraseña no cumple los requisitos mínimos' },
    });
  });

  it('shows a rate-limit message for too many registration attempts', async () => {
    authServiceMock.registerPlayer.mockRejectedValueOnce(new Error('Too many requests'));

    const res = await registerPlayer({
      displayName: 'Mateo Duran',
      email: 'mateo@example.com',
      password: 'Hola12345',
      confirmPassword: 'Hola12345',
    });

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Demasiados intentos de registro. Esperá unos minutos y volvé a intentarlo.',
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const authServiceMock = vi.hoisted(() => ({
  registerPlayer: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock('../services/authService.js', () => ({
  authService: authServiceMock,
}));

import { authController } from './authController.js';

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};

function createResponse(): MockResponse {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.send.mockReturnValue(response);
  return response;
}

async function registerPlayer(body: unknown): Promise<MockResponse> {
  const res = createResponse();
  await authController.registerPlayer({ body } as never, res as never);
  return res;
}

async function changePassword(body: unknown, authorization = 'Bearer token-123'): Promise<MockResponse> {
  const res = createResponse();
  await authController.changePassword(
    { body, headers: { authorization } } as never,
    res as never,
  );
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

describe('authController.changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.changePassword.mockResolvedValue(undefined);
  });

  it('validates payload and updates password through the service', async () => {
    const res = await changePassword({
      currentPassword: 'Actual123',
      newPassword: 'Nueva1234',
      confirmPassword: 'Nueva1234',
    });

    expect(authServiceMock.changePassword).toHaveBeenCalledWith({
      accessToken: 'token-123',
      currentPassword: 'Actual123',
      newPassword: 'Nueva1234',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'ContraseÃ±a actualizada correctamente',
    });
  });

  it('returns validation errors without calling the service', async () => {
    const res = await changePassword({
      currentPassword: '',
      newPassword: '123',
      confirmPassword: '',
    });

    expect(authServiceMock.changePassword).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Datos invÃ¡lidos',
      errors: {
        currentPassword: 'IngresÃ¡ tu contraseÃ±a actual',
        newPassword: 'La nueva contraseÃ±a debe tener al menos 8 caracteres',
        confirmPassword: 'ConfirmÃ¡ tu nueva contraseÃ±a',
      },
    });
  });

  it('maps current password failures to the currentPassword field', async () => {
    authServiceMock.changePassword.mockRejectedValueOnce(
      new Error('Current password is incorrect'),
    );

    const res = await changePassword({
      currentPassword: 'Actual123',
      newPassword: 'Nueva1234',
      confirmPassword: 'Nueva1234',
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Datos invÃ¡lidos',
      errors: { currentPassword: 'La contraseÃ±a actual no es correcta' },
    });
  });

  it('requires an auth token', async () => {
    const res = await changePassword({
      currentPassword: 'Actual123',
      newPassword: 'Nueva1234',
      confirmPassword: 'Nueva1234',
    }, '');

    expect(authServiceMock.changePassword).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing or malformed token.' });
  });
});

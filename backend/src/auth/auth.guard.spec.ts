import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const firebaseService = {
    verifyIdToken: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const usersService = {
    findOrCreateForLogin: jest.fn(),
  };

  let guard: AuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    guard = new AuthGuard(
      firebaseService as never,
      reflector as never,
      usersService as never,
      {} as never,
    );
  });

  function createContext(authorization?: string) {
    const request = {
      headers: { authorization },
      originalUrl: '/api/users',
    };
    return {
      request,
      context: {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      },
    };
  }

  it('allows public routes without a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = createContext();

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(firebaseService.verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects requests without a bearer token', async () => {
    const { context } = createContext();

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('provisions a new user using the email prefix when the token has no name', async () => {
    firebaseService.verifyIdToken.mockResolvedValue({
      uid: 'firebase-1',
      email: 'ada@example.com',
    });
    usersService.findOrCreateForLogin.mockResolvedValue({ id: 'user-1' });
    const { context, request } = createContext('Bearer token-1');

    await expect(guard.canActivate(context as never)).resolves.toBe(true);

    expect(usersService.findOrCreateForLogin).toHaveBeenCalledWith({
      name: 'ada',
      email: 'ada@example.com',
      firebaseUid: 'firebase-1',
      photoUrl: undefined,
    });
    expect(request['user']).toEqual({
      uid: 'firebase-1',
      email: 'ada@example.com',
      id: 'user-1',
    });
  });

  it('reuses an existing user without creating another one', async () => {
    firebaseService.verifyIdToken.mockResolvedValue({
      uid: 'firebase-1',
      email: 'ada@example.com',
      name: 'Ada',
    });
    usersService.findOrCreateForLogin.mockResolvedValue({ id: 'user-1' });
    const { context } = createContext('Bearer token-1');

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(usersService.findOrCreateForLogin).toHaveBeenCalledTimes(1);
  });

  it('rejects tokens that cannot be verified', async () => {
    firebaseService.verifyIdToken.mockRejectedValue(new Error('invalid token'));
    const { context } = createContext('Bearer token-1');

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService login provisioning', () => {
  const dto = {
    firebaseUid: 'firebase-1',
    email: 'ada@example.com',
    name: 'Ada',
  };
  const existing = { id: 'user-1', ...dto, name: 'Custom name' };
  let service: UsersService;
  let user: { findUnique: jest.Mock; create: jest.Mock };

  const conflict = (field: string) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '7.8.0',
      meta: { target: [field] },
    });

  beforeEach(() => {
    user = { findUnique: jest.fn(), create: jest.fn() };
    service = new UsersService({ user } as unknown as PrismaService);
  });

  it('preserves an existing profile without writing', async () => {
    user.findUnique.mockResolvedValue(existing);
    await expect(service.findOrCreateForLogin(dto)).resolves.toBe(existing);
    expect(user.create).not.toHaveBeenCalled();
  });

  it('creates the user, personal organization and owner membership together', async () => {
    user.findUnique.mockResolvedValue(null);
    user.create.mockResolvedValue(existing);
    await expect(service.findOrCreateForLogin(dto)).resolves.toBe(existing);
    expect(user.create).toHaveBeenCalledWith({
      data: {
        ...dto,
        memberships: {
          create: {
            organization: {
              create: {
                name: "Ada's Organization",
                description: 'Personal organization for Ada',
              },
            },
            role: 'OWNER',
          },
        },
      },
    });
  });

  it('returns the same identity for simultaneous first-login requests', async () => {
    // Both requests see no user before either nested create completes.
    user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue(existing);
    user.create
      .mockResolvedValueOnce(existing)
      .mockRejectedValueOnce(conflict('firebaseUid'));

    const results = await Promise.all([
      service.findOrCreateForLogin(dto),
      service.findOrCreateForLogin(dto),
    ]);
    expect(results).toEqual([existing, existing]);
    expect(user.create).toHaveBeenCalledTimes(2);
    expect(user.findUnique).toHaveBeenLastCalledWith({
      where: { firebaseUid: dto.firebaseUid },
    });
  });

  it('does not associate another Firebase identity on email conflict', async () => {
    const error = conflict('email');
    user.findUnique.mockResolvedValue(null);
    user.create.mockRejectedValue(error);
    await expect(service.findOrCreateForLogin(dto)).rejects.toBe(error);
  });

  it('propagates unrelated database errors without retrying creation', async () => {
    const error = new Error('Database unavailable');
    user.findUnique.mockResolvedValue(null);
    user.create.mockRejectedValue(error);
    await expect(service.findOrCreateForLogin(dto)).rejects.toBe(error);
    expect(user.findUnique).toHaveBeenCalledTimes(1);
    expect(user.create).toHaveBeenCalledTimes(1);
  });
});

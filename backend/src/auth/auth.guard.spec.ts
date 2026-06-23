import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  it('should be defined', () => {
    expect(new AuthGuard({} as any, {} as any, {} as any)).toBeDefined();
  });
});

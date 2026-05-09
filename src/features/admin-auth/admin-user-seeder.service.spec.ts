import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { AdminUserSeederService } from './admin-user-seeder.service';
import { AdminUsersService } from './admin-users.service';

describe('AdminUserSeederService', () => {
  let service: AdminUserSeederService;
  let mockAdminUsersService: {
    findByEmail: jest.Mock;
    create: jest.Mock;
  };
  let loggerLogSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  const ORIGINAL_ENV = { ...process.env };

  beforeEach(async () => {
    mockAdminUsersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserSeederService,
        { provide: AdminUsersService, useValue: mockAdminUsersService },
      ],
    }).compile();

    service = module.get<AdminUserSeederService>(AdminUserSeederService);
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerLogSpy?.mockRestore();
    loggerErrorSpy?.mockRestore();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SEED_ADMIN_EMAIL;
    delete process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_ADMIN_NAME;
  });

  it('skips when SEED_ADMIN_EMAIL is missing', async () => {
    process.env.SEED_ADMIN_PASSWORD = 'changeme1234';

    await service.onApplicationBootstrap();

    expect(mockAdminUsersService.findByEmail).not.toHaveBeenCalled();
    expect(mockAdminUsersService.create).not.toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping admin user seeding'),
    );
  });

  it('skips when SEED_ADMIN_PASSWORD is missing', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@local.dev';

    await service.onApplicationBootstrap();

    expect(mockAdminUsersService.findByEmail).not.toHaveBeenCalled();
    expect(mockAdminUsersService.create).not.toHaveBeenCalled();
  });

  it('is idempotent when the admin user already exists', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@local.dev';
    process.env.SEED_ADMIN_PASSWORD = 'changeme1234';
    mockAdminUsersService.findByEmail.mockResolvedValue({
      _id: 'existing',
      email: 'admin@local.dev',
    });

    await service.onApplicationBootstrap();

    expect(mockAdminUsersService.findByEmail).toHaveBeenCalledWith(
      'admin@local.dev',
    );
    expect(mockAdminUsersService.create).not.toHaveBeenCalled();
    expect(loggerLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('already exists. Skipping.'),
    );
  });

  it('creates the admin user with derived display name when SEED_ADMIN_NAME is absent', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@local.dev';
    process.env.SEED_ADMIN_PASSWORD = 'changeme1234';
    mockAdminUsersService.findByEmail.mockResolvedValue(null);
    mockAdminUsersService.create.mockResolvedValue({
      _id: 'new-admin-id',
      email: 'admin@local.dev',
    });

    await service.onApplicationBootstrap();

    expect(mockAdminUsersService.create).toHaveBeenCalledWith({
      email: 'admin@local.dev',
      password: 'changeme1234',
      displayName: 'Admin',
    });
  });

  it('creates the admin user with explicit SEED_ADMIN_NAME when set', async () => {
    process.env.SEED_ADMIN_EMAIL = 'ops@local.dev';
    process.env.SEED_ADMIN_PASSWORD = 'changeme1234';
    process.env.SEED_ADMIN_NAME = 'Ops Admin';
    mockAdminUsersService.findByEmail.mockResolvedValue(null);
    mockAdminUsersService.create.mockResolvedValue({
      _id: 'new-admin-id',
      email: 'ops@local.dev',
    });

    await service.onApplicationBootstrap();

    expect(mockAdminUsersService.create).toHaveBeenCalledWith({
      email: 'ops@local.dev',
      password: 'changeme1234',
      displayName: 'Ops Admin',
    });
  });

  it('rethrows when AdminUsersService.create fails', async () => {
    process.env.SEED_ADMIN_EMAIL = 'admin@local.dev';
    process.env.SEED_ADMIN_PASSWORD = 'changeme1234';
    mockAdminUsersService.findByEmail.mockResolvedValue(null);
    const failure = new Error('boom');
    mockAdminUsersService.create.mockRejectedValue(failure);

    await expect(service.onApplicationBootstrap()).rejects.toBe(failure);
    expect(loggerErrorSpy).toHaveBeenCalled();
  });
});

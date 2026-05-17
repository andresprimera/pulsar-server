import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_CLIENT_AUTH_KEY } from '@shared/decorators/client-auth.decorator';
import { CLIENT_ROLES_METADATA_KEY } from '@shared/decorators/client-roles.decorator';
import { OWNS_CLIENT_METADATA_KEY } from '@shared/decorators/owns-client.decorator';
import type { ClientUserPrincipal } from '@shared/types/express';
import { ClientAgentsClientController } from './client-agents.client.controller';
import { ClientAgentsService } from './client-agents.service';

describe('ClientAgentsClientController', () => {
  let controller: ClientAgentsClientController;
  let mockClientAgentsService: { findByClientForClient: jest.Mock };

  const buildPrincipal = (
    overrides: Partial<ClientUserPrincipal> = {},
  ): ClientUserPrincipal => ({
    userId: 'user-1',
    clientId: 'client-1',
    sessionId: 'sess-1',
    email: 'owner@example.com',
    status: 'active',
    clientRole: 'owner',
    ...overrides,
  });

  beforeEach(async () => {
    mockClientAgentsService = { findByClientForClient: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientAgentsClientController],
      providers: [
        { provide: ClientAgentsService, useValue: mockClientAgentsService },
      ],
    }).compile();

    controller = module.get(ClientAgentsClientController);
  });

  describe('decorator metadata', () => {
    it('class base path is "client-agents"', () => {
      expect(
        Reflect.getMetadata(PATH_METADATA, ClientAgentsClientController),
      ).toBe('client-agents');
    });

    it('listMine method path is "me"', () => {
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          ClientAgentsClientController.prototype.listMine,
        ),
      ).toBe('me');
    });

    it('listMine carries @ClientAuth() metadata', () => {
      expect(
        Reflect.getMetadata(
          IS_CLIENT_AUTH_KEY,
          ClientAgentsClientController.prototype.listMine,
        ),
      ).toBe(true);
    });

    it('listMine restricts roles to [owner, operator]', () => {
      expect(
        Reflect.getMetadata(
          CLIENT_ROLES_METADATA_KEY,
          ClientAgentsClientController.prototype.listMine,
        ),
      ).toEqual(['owner', 'operator']);
    });

    it('listMine has no @OwnsClient() — route has no :clientId segment', () => {
      expect(
        Reflect.getMetadata(
          OWNS_CLIENT_METADATA_KEY,
          ClientAgentsClientController.prototype.listMine,
        ),
      ).toBeUndefined();
    });

    it('class has no @OwnsClient() — route has no :clientId segment', () => {
      expect(
        Reflect.getMetadata(
          OWNS_CLIENT_METADATA_KEY,
          ClientAgentsClientController,
        ),
      ).toBeUndefined();
    });
  });

  describe('listMine', () => {
    it('delegates to the service with principal.clientId and returns its result', async () => {
      const principal = buildPrincipal({ clientId: 'tenant-xyz' });
      const expected = [
        {
          id: 'ca-1',
          status: 'active' as const,
          agent: {
            id: 'agent-1',
            name: 'Agent Alpha',
            status: 'active',
            kind: 'customer_service' as const,
          },
        },
      ];
      mockClientAgentsService.findByClientForClient.mockResolvedValue(expected);

      const result = await controller.listMine(principal);

      expect(result).toBe(expected);
      expect(
        mockClientAgentsService.findByClientForClient,
      ).toHaveBeenCalledWith('tenant-xyz');
      expect(
        mockClientAgentsService.findByClientForClient,
      ).toHaveBeenCalledTimes(1);
    });

    it('throws UnauthorizedException and skips the service when principal is undefined', async () => {
      await expect(controller.listMine(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(
        mockClientAgentsService.findByClientForClient,
      ).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when principal.clientId is empty', async () => {
      await expect(
        controller.listMine(buildPrincipal({ clientId: '' })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(
        mockClientAgentsService.findByClientForClient,
      ).not.toHaveBeenCalled();
    });

    it('signature accepts only the principal — smuggled clientId on the request is unreachable', () => {
      // Defense in depth: the handler signature has exactly one parameter
      // (the principal). There is no @Param/@Query/@Body for `clientId`,
      // so any smuggled value on req.params/req.query/req.body cannot bind
      // and the handler can only ever receive `principal.clientId`.
      expect(ClientAgentsClientController.prototype.listMine.length).toBe(1);
    });
  });
});

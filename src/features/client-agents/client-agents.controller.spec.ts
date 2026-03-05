import { Test, TestingModule } from '@nestjs/testing';
import { ClientAgentsController } from './client-agents.controller';
import { ClientAgentsService } from './client-agents.service';

describe('ClientAgentsController', () => {
  let controller: ClientAgentsController;
  let mockClientAgentsService: any;

  const mockClientAgent = {
    id: 'ca-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    status: 'active',
    agentPricing: { amount: 100, currency: 'USD' },
  };

  beforeEach(async () => {
    mockClientAgentsService = {
      create: jest.fn(),
      findByClient: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      calculateClientTotal: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientAgentsController],
      providers: [
        {
          provide: ClientAgentsService,
          useValue: mockClientAgentsService,
        },
      ],
    }).compile();

    controller = module.get<ClientAgentsController>(ClientAgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto: any = {
        clientId: 'client-1',
        agentId: 'agent-1',
        channels: [
          {
            channelId: '507f1f77bcf86cd799439011',
            provider: 'instagram',
            credentials: { instagramAccountId: '17841400000000000' },
            llmConfig: {
              provider: 'openai',
              apiKey: 'test-key',
              model: 'gpt-4o',
            },
          },
        ],
      };
      mockClientAgentsService.create.mockResolvedValue(mockClientAgent);

      const result = await controller.create(dto);

      expect(mockClientAgentsService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockClientAgent);
    });
  });

  describe('findByClient', () => {
    it('should call service.findByClient', async () => {
      mockClientAgentsService.findByClient.mockResolvedValue([mockClientAgent]);

      const result = await controller.findByClient('client-1');

      expect(mockClientAgentsService.findByClient).toHaveBeenCalledWith(
        'client-1',
      );
      expect(result).toEqual([mockClientAgent]);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = {};
      mockClientAgentsService.update.mockResolvedValue(mockClientAgent);

      const result = await controller.update('ca-1', dto);

      expect(mockClientAgentsService.update).toHaveBeenCalledWith('ca-1', dto);
      expect(result).toEqual(mockClientAgent);
    });
  });

  describe('updateStatus', () => {
    it('should call service.updateStatus', async () => {
      const dto = { status: 'inactive' as const };
      mockClientAgentsService.updateStatus.mockResolvedValue({
        ...mockClientAgent,
        status: 'inactive',
      });

      const result = await controller.updateStatus('ca-1', dto);

      expect(mockClientAgentsService.updateStatus).toHaveBeenCalledWith(
        'ca-1',
        dto,
      );
      expect(result.status).toBe('inactive');
    });
  });

  describe('calculateClientTotal', () => {
    it('should call service.calculateClientTotal', async () => {
      mockClientAgentsService.calculateClientTotal.mockResolvedValue({
        total: 100,
        currency: 'USD',
      });

      const result = await controller.calculateClientTotal('client-1');

      expect(mockClientAgentsService.calculateClientTotal).toHaveBeenCalledWith(
        'client-1',
      );
      expect(result).toEqual({ total: 100, currency: 'USD' });
    });
  });
});

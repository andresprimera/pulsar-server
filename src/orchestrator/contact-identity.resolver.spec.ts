import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ContactIdentityResolver } from './contact-identity.resolver';
import { ContactRepository } from '@persistence/repositories/contact.repository';
import {
  CONTACT_IDENTIFIER_REGISTRY,
  ContactIdentifierRegistry,
} from '@domain/channels/contact-identifier.interface';

describe('ContactIdentityResolver', () => {
  let service: ContactIdentityResolver;
  let contactRepository: jest.Mocked<ContactRepository>;
  let identifierExtractorRegistry: jest.Mocked<ContactIdentifierRegistry>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactIdentityResolver,
        {
          provide: CONTACT_IDENTIFIER_REGISTRY,
          useValue: {
            resolve: jest.fn(),
          },
        },
        {
          provide: ContactRepository,
          useValue: {
            findOrCreateByExternalIdentity: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ContactIdentityResolver);
    contactRepository = module.get(ContactRepository);
    identifierExtractorRegistry = module.get(CONTACT_IDENTIFIER_REGISTRY);
  });

  it('should resolve and upsert contact using normalized identifier', async () => {
    const clientId = new Types.ObjectId('507f1f77bcf86cd799439011');
    const channelId = new Types.ObjectId('507f1f77bcf86cd799439014');

    identifierExtractorRegistry.resolve.mockReturnValue({
      externalId: '  user_123  ',
      externalIdRaw: '  user_123  ',
      identifierType: 'platform_id',
    });

    contactRepository.findOrCreateByExternalIdentity.mockResolvedValue({
      _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
    } as any);

    await service.resolveContact({
      channelType: 'instagram',
      payload: { sender: { id: 'user_123' } },
      clientId,
      channelId,
      contactName: 'user_123',
    });

    expect(identifierExtractorRegistry.resolve).toHaveBeenCalledWith(
      'instagram',
      { sender: { id: 'user_123' } },
    );

    expect(
      contactRepository.findOrCreateByExternalIdentity,
    ).toHaveBeenCalledWith(
      clientId,
      channelId,
      'user_123',
      '  user_123  ',
      'platform_id',
      'user_123',
      undefined,
    );
  });
});

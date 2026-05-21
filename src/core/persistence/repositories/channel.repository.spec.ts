import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { ChannelRepository } from './channel.repository';
import { Channel } from '@persistence/schemas/channel.schema';

describe('ChannelRepository.findByIds', () => {
  let repository: ChannelRepository;
  let mockModel: { find: jest.Mock };

  beforeEach(async () => {
    mockModel = { find: jest.fn() } as unknown as { find: jest.Mock };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelRepository,
        { provide: getModelToken(Channel.name), useValue: mockModel },
      ],
    }).compile();

    repository = module.get(ChannelRepository);
  });

  function setupChain(rows: unknown) {
    const exec = jest.fn().mockResolvedValue(rows);
    const lean = jest.fn().mockReturnValue({ exec });
    mockModel.find.mockReturnValue({ lean });
    return { exec, lean };
  }

  it('passes $in filter with safe projection (_id, name, type)', async () => {
    setupChain([]);

    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    await repository.findByIds(ids);

    const [filter, projection] = mockModel.find.mock.calls[0];
    expect(filter).toEqual({ _id: { $in: ids } });
    expect(projection).toEqual({ _id: 1, name: 1, type: 1 });
  });

  it('short-circuits with [] when the input list is empty (no DB roundtrip)', async () => {
    const out = await repository.findByIds([]);
    expect(out).toEqual([]);
    expect(mockModel.find).not.toHaveBeenCalled();
  });

  it('returns the model rows as-is', async () => {
    const id1 = new Types.ObjectId();
    const id2 = new Types.ObjectId();
    const rows = [
      { _id: id1, name: 'WhatsApp BR', type: 'whatsapp' },
      { _id: id2, name: 'Telegram', type: 'telegram' },
    ];
    setupChain(rows);

    const out = await repository.findByIds([id1, id2]);
    expect(out).toEqual(rows);
  });

  it('applies .lean() before exec', async () => {
    const chain = setupChain([]);
    await repository.findByIds([new Types.ObjectId()]);

    expect(chain.lean).toHaveBeenCalledTimes(1);
    expect(chain.exec).toHaveBeenCalledTimes(1);
  });
});

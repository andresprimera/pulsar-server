import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PersonalityRepository } from '@persistence/repositories/personality.repository';
import { CreatePersonalityDto } from './dto/create-personality.dto';
import { UpdatePersonalityDto } from './dto/update-personality.dto';
import { UpdatePersonalityStatusDto } from './dto/update-personality-status.dto';

@Injectable()
export class PersonalitiesService {
  constructor(private readonly personalityRepository: PersonalityRepository) {}

  async create(dto: CreatePersonalityDto) {
    try {
      return await this.personalityRepository.create({
        ...dto,
        status: 'active',
        examplePhrases: dto.examplePhrases ?? [],
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException(
          'A personality with this name already exists',
        );
      }
      throw error;
    }
  }

  async findAll(status?: 'active' | 'inactive' | 'archived') {
    if (status) {
      return this.personalityRepository.findByStatus(status);
    }
    return this.personalityRepository.findAll();
  }

  async findAvailable() {
    return this.personalityRepository.findByStatus('active');
  }

  async findOne(id: string) {
    const personality = await this.personalityRepository.findById(id);
    if (!personality) {
      throw new NotFoundException('Personality not found');
    }
    return personality;
  }

  async update(id: string, dto: UpdatePersonalityDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException(
        'Archived personalities cannot be modified',
      );
    }

    try {
      const personality = await this.personalityRepository.update(id, dto);
      if (!personality) {
        throw new NotFoundException('Personality not found');
      }
      return personality;
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException(
          'A personality with this name already exists',
        );
      }
      throw error;
    }
  }

  async updateStatus(id: string, dto: UpdatePersonalityStatusDto) {
    const existing = await this.findOne(id);

    if (existing.status === 'archived') {
      throw new BadRequestException(
        'Archived personalities cannot be modified',
      );
    }

    const personality = await this.personalityRepository.update(id, {
      status: dto.status,
    });
    if (!personality) {
      throw new NotFoundException('Personality not found');
    }
    return personality;
  }
}

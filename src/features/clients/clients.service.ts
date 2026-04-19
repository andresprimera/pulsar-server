import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { isValidCurrencyCode } from '@domain/billing/currency.validator';
import { UpdateQuery } from 'mongoose';
import { ClientRepository } from '@persistence/repositories/client.repository';
import { Client } from '@persistence/schemas/client.schema';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { UpdateClientStatusDto } from './dto/update-client-status.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly clientRepository: ClientRepository) {}

  async create(dto: CreateClientDto) {
    const billingCurrency = (dto.billingCurrency ?? 'USD').toUpperCase();
    if (!isValidCurrencyCode(billingCurrency)) {
      throw new BadRequestException('Invalid ISO 4217 currency code');
    }
    const { companyBrief, ...rest } = dto;
    const briefTrimmed = companyBrief?.trim();
    return this.clientRepository.create({
      ...rest,
      billingCurrency,
      billingAnchor: new Date(),
      status: 'active',
      ...(briefTrimmed ? { companyBrief: briefTrimmed } : {}),
    });
  }

  async findAll(status?: 'active' | 'inactive' | 'archived') {
    if (status) {
      return this.clientRepository.findByStatus(status);
    }
    return this.clientRepository.findAll();
  }

  async findById(id: string) {
    const client = await this.clientRepository.findById(id);
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async update(id: string, dto: UpdateClientDto) {
    const existing = await this.findById(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived clients cannot be modified');
    }

    if (dto.billingCurrency != null) {
      const billingCurrency = dto.billingCurrency.toUpperCase();
      if (!isValidCurrencyCode(billingCurrency)) {
        throw new BadRequestException('Invalid ISO 4217 currency code');
      }
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, string> = {};

    if (dto.name !== undefined) {
      $set.name = dto.name;
    }
    if (dto.billingCurrency !== undefined) {
      $set.billingCurrency = dto.billingCurrency.toUpperCase();
    }
    if (dto.companyBrief !== undefined) {
      const t = dto.companyBrief.trim();
      if (t) {
        $set.companyBrief = t;
      } else {
        $unset.companyBrief = '';
      }
    }

    if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
      return existing;
    }

    const updateQuery: UpdateQuery<Client> = {};
    if (Object.keys($set).length > 0) {
      updateQuery.$set = $set;
    }
    if (Object.keys($unset).length > 0) {
      updateQuery.$unset = $unset;
    }

    const client = await this.clientRepository.updateWithQuery(id, updateQuery);
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  async updateStatus(id: string, dto: UpdateClientStatusDto) {
    const existing = await this.findById(id);

    if (existing.status === 'archived') {
      throw new BadRequestException('Archived clients cannot be modified');
    }

    const client = await this.clientRepository.update(id, {
      status: dto.status,
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }
}

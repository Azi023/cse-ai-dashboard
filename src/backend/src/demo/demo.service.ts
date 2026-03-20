import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DemoAccount } from './entities/demo-account.entity';

@Injectable()
export class DemoService implements OnModuleInit {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    @InjectRepository(DemoAccount)
    private readonly demoAccountRepo: Repository<DemoAccount>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultAccount();
  }

  private async seedDefaultAccount(): Promise<void> {
    const existing = await this.demoAccountRepo.count();
    if (existing > 0) return;

    await this.demoAccountRepo.save({
      name: 'Default Demo',
      initial_capital: 1000000.0,
      cash_balance: 1000000.0,
      total_fees_paid: 0,
      strategy: 'rca',
      is_active: true,
    });

    this.logger.log('Demo account seeded: Default Demo (LKR 1,000,000)');
  }
}

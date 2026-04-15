import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from '../../entities/user-preferences.entity';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class UserPreferencesService {
  private readonly logger = new Logger(UserPreferencesService.name);

  constructor(
    @InjectRepository(UserPreferences)
    private readonly prefsRepo: Repository<UserPreferences>,
  ) {}

  /**
   * Get preferences for a user, creating defaults if none exist.
   */
  async getPreferences(username: string): Promise<UserPreferences> {
    const existing = await this.prefsRepo.findOne({ where: { username } });
    if (existing) {
      return existing;
    }

    // Auto-create default preferences on first access
    const defaults = this.prefsRepo.create({
      username,
      shariah_mode: true, // Default ON for owner
      dashboard_mode: 'pro',
      language: 'en',
    });
    const saved = await this.prefsRepo.save(defaults);
    this.logger.log(`Created default preferences for user: ${username}`);
    return saved;
  }

  /**
   * Update preferences (partial update).
   */
  async updatePreferences(
    username: string,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferences> {
    const prefs = await this.getPreferences(username);
    const updated = { ...prefs, ...dto };
    return this.prefsRepo.save(updated);
  }

  /**
   * Check if Shariah mode is enabled for a user.
   * Used by other services to conditionally filter responses.
   */
  async isShariahMode(username: string): Promise<boolean> {
    const prefs = await this.getPreferences(username);
    return prefs.shariah_mode;
  }

  /**
   * Get Shariah mode for the default (single) user.
   * Convenience for services that don't have access to req.user.
   */
  async getDefaultShariahMode(): Promise<boolean> {
    const prefs = await this.prefsRepo.findOne({
      where: {},
      order: { id: 'ASC' },
    });
    return prefs?.shariah_mode ?? true;
  }
}

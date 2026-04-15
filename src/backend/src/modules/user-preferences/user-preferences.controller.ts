import { Controller, Get, Patch, Body, Req } from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

interface JwtUser {
  username: string;
}

function getUsername(req: { user?: JwtUser }): string {
  return req.user?.username ?? 'default';
}

@Controller('user/preferences')
export class UserPreferencesController {
  constructor(private readonly prefsService: UserPreferencesService) {}

  @Get()
  async getPreferences(@Req() req: { user?: JwtUser }) {
    return this.prefsService.getPreferences(getUsername(req));
  }

  @Patch()
  async updatePreferences(
    @Req() req: { user?: JwtUser },
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.prefsService.updatePreferences(getUsername(req), dto);
  }
}

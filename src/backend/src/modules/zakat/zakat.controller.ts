import {
  Controller,
  Get,
  Query,
  ParseFloatPipe,
  DefaultValuePipe,
  Optional,
} from '@nestjs/common';
import { ZakatService } from './zakat.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('zakat')
export class ZakatController {
  constructor(private readonly zakatService: ZakatService) {}

  /**
   * GET /api/zakat/calculate?nisab=1638000
   * Returns per-holding Zakat breakdown using AAOIFI balance-sheet method.
   * nisab: Nisab threshold in LKR (default 1,638,000 ≈ 85g gold)
   */
  @Get('calculate')
  async calculate(
    @Query('nisab', new DefaultValuePipe(1638000), ParseFloatPipe)
    nisab: number,
  ) {
    return this.zakatService.calculateZakat(nisab);
  }
}

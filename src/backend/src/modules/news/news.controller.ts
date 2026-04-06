import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsItem } from '../../entities';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  async getNews(
    @Query('limit') limit?: string,
    @Query('source') source?: string,
    @Query('category') category?: string,
    @Query('impact') impact?: string,
    @Query('search') search?: string,
  ): Promise<NewsItem[]> {
    return this.newsService.getNews({
      limit: limit ? parseInt(limit, 10) : 50,
      source,
      category,
      impact,
      search,
    });
  }

  @Get('sources')
  async getSources(): Promise<
    Array<{ name: string; label: string; count: number }>
  > {
    return this.newsService.getSources();
  }

  @Get('high-impact')
  async getHighImpact(@Query('hours') hours?: string): Promise<NewsItem[]> {
    return this.newsService.getHighImpactNews(hours ? parseInt(hours, 10) : 24);
  }

  @Get(':id')
  async getNewsById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NewsItem | null> {
    return this.newsService.getNewsById(id);
  }

  @Post('refresh')
  async refreshFeeds(): Promise<{ fetched: number; errors: string[] }> {
    return this.newsService.fetchAllFeeds();
  }
}

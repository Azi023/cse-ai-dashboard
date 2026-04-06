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

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Public()
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

  @Public()
  @Get('sources')
  async getSources(): Promise<
    Array<{ name: string; label: string; count: number }>
  > {
    return this.newsService.getSources();
  }

  @Public()
  @Get('high-impact')
  async getHighImpact(@Query('hours') hours?: string): Promise<NewsItem[]> {
    return this.newsService.getHighImpactNews(hours ? parseInt(hours, 10) : 24);
  }

  @Public()
  @Get(':id')
  async getNewsById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NewsItem | null> {
    return this.newsService.getNewsById(id);
  }

  /** POST /api/news/refresh — Requires JWT. */
  @Post('refresh')
  async refreshFeeds(): Promise<{
    message: string;
    result: { fetched: number; errors: string[] };
  }> {
    const result = await this.newsService.fetchAllFeeds();
    return { message: 'News feeds refreshed', result };
  }
}

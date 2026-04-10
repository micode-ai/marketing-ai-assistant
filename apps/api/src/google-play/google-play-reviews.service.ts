import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { GooglePlayAuthService } from './google-play-auth.service';

interface GetReviewsOptions {
  page?: number;
  limit?: number;
  starRating?: number;
  hasReply?: boolean;
  sortBy?: 'reviewCreatedAt' | 'starRating';
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class GooglePlayReviewsService {
  private readonly logger = new Logger(GooglePlayReviewsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private authService: GooglePlayAuthService,
  ) {}

  /**
   * Paginated reviews from DB with filters.
   */
  async getReviews(projectId: string, options: GetReviewsOptions = {}) {
    const {
      page = 1,
      limit = 20,
      starRating,
      hasReply,
      sortBy = 'reviewCreatedAt',
      sortOrder = 'desc',
    } = options;

    const where: any = { projectId };
    if (starRating !== undefined) where.starRating = starRating;
    if (hasReply !== undefined) where.isReplied = hasReply;

    const [reviews, total] = await Promise.all([
      this.prisma.appReview.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.appReview.count({ where }),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Send a reply to a Google Play review via the Developer API v3.
   */
  async replyToReview(
    projectId: string,
    reviewId: string,
    text: string,
  ) {
    const config = await this.authService.getConfig(projectId);
    const accessToken = await this.authService.getValidAccessToken(projectId);

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${config.packageName}/reviews/${reviewId}:reply`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ replyText: text }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Reply to review failed: ${error}`);
      throw new InternalServerErrorException('Failed to reply to review');
    }

    const result = await response.json();

    // Update the review in the database
    await this.prisma.appReview.updateMany({
      where: { projectId, reviewId },
      data: {
        replyText: text,
        replyCreatedAt: new Date(),
        isReplied: true,
      },
    });

    return result;
  }

  /**
   * Generate an AI-powered reply suggestion for a review.
   */
  async generateAiReply(projectId: string, reviewId: string) {
    const review = await this.prisma.appReview.findFirst({
      where: { projectId, reviewId },
    });

    if (!review) {
      throw new BadRequestException('Review not found');
    }

    const agentUrl = this.config.get('AI_AGENT_URL', 'http://localhost:3001');

    try {
      const response = await fetch(`${agentUrl}/generate-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewText: review.text,
          starRating: review.starRating,
          authorName: review.authorName,
          language: review.language,
          projectId,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI agent responded with ${response.status}`);
      }

      const data = await response.json() as { reply: string };

      // Save the AI suggestion to the database
      await this.prisma.appReview.updateMany({
        where: { projectId, reviewId },
        data: { aiSuggestedReply: data.reply },
      });

      return { suggestion: data.reply };
    } catch (error) {
      this.logger.error(`AI reply generation failed: ${error}`);
      throw new InternalServerErrorException('Failed to generate AI reply');
    }
  }
}

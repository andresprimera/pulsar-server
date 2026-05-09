import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { OnboardingService } from './onboarding.service';
import { RegisterAndHireDto } from './dto/register-and-hire.dto';
import { ClientContextSuggestionService } from '@client-context-suggestions/client-context-suggestion.service';
import { SuggestCompanyBriefDto } from '@client-context-suggestions/dto/suggest-company-brief.dto';
import { SuggestPromptSupplementDto } from '@client-context-suggestions/dto/suggest-prompt-supplement.dto';
import { Public } from '@shared/decorators/public.decorator';

@Public()
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly clientContextSuggestionService: ClientContextSuggestionService,
  ) {}

  @Post('prompt-supplement/suggest')
  @UseInterceptors(
    FilesInterceptor('files', 12, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  suggestPromptSupplement(
    @Body() dto: SuggestPromptSupplementDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.clientContextSuggestionService.suggestPromptSupplement(
      dto,
      files ?? [],
    );
  }

  @Post('company-brief/suggest')
  @UseInterceptors(
    FilesInterceptor('files', 12, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  suggestCompanyBrief(
    @Body() dto: SuggestCompanyBriefDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.clientContextSuggestionService.suggestCompanyBrief(
      dto,
      files ?? [],
    );
  }

  @Post('register-and-hire')
  @HttpCode(HttpStatus.CREATED)
  async registerAndHire(@Body() dto: RegisterAndHireDto) {
    return this.onboardingService.registerAndHire(dto);
  }
}

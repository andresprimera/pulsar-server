import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ClientContextSuggestionService } from './client-context-suggestion.service';
import { SuggestCompanyBriefDto } from './dto/suggest-company-brief.dto';
import { SuggestPromptSupplementDto } from './dto/suggest-prompt-supplement.dto';

@Controller('clients/context-suggestions')
export class ClientContextSuggestionsController {
  constructor(
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
}

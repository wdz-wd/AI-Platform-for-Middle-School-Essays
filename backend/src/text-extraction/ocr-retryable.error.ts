import { InternalServerErrorException } from '@nestjs/common';

/** A temporary OCR failure that can safely resume a known remote job. */
export class OcrRetryableError extends InternalServerErrorException {}

export class OcrJobExpiredError extends OcrRetryableError {}

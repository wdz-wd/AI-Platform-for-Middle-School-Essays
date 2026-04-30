import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

@Injectable()
export class BaiduOcrTokenService {
  private readonly logger = new Logger(BaiduOcrTokenService.name);
  private readonly apiKey = process.env.BAIDU_OCR_API_KEY?.trim() ?? '';
  private readonly secretKey = process.env.BAIDU_OCR_SECRET_KEY?.trim() ?? '';
  private readonly tokenUrl =
    process.env.BAIDU_OCR_TOKEN_URL?.trim() ??
    'https://aip.baidubce.com/oauth/2.0/token';
  private readonly refreshBufferMs = this.parseNumber(
    process.env.BAIDU_OCR_REFRESH_BUFFER_MS,
    24 * 60 * 60 * 1000,
  );

  private cachedToken = '';
  private expiresAt = 0;
  private refreshPromise: Promise<string> | null = null;

  isEnabled() {
    return !!this.apiKey && !!this.secretKey;
  }

  async getAccessToken(forceRefresh = false) {
    if (!this.isEnabled()) {
      throw new InternalServerErrorException(
        '缺少百度 OCR API Key 或 Secret Key，请在 .env 中配置 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY',
      );
    }

    if (!forceRefresh && this.cachedToken && Date.now() < this.expiresAt) {
      return this.cachedToken;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.fetchAccessToken().finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async fetchAccessToken() {
    const url = new URL(this.tokenUrl);
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', this.apiKey);
    url.searchParams.set('client_secret', this.secretKey);

    const response = await fetch(url.toString(), {
      method: 'POST',
    });
    const json = (await response.json()) as TokenResponse;

    if (!response.ok || !json.access_token) {
      throw new InternalServerErrorException(
        `获取百度 OCR access_token 失败：${json.error_description || json.error || response.statusText}`,
      );
    }

    const expiresInMs = Math.max((json.expires_in ?? 2592000) * 1000, 60_000);
    this.cachedToken = json.access_token.trim();
    this.expiresAt = Date.now() + Math.max(expiresInMs - this.refreshBufferMs, 60_000);
    this.logger.log('百度 OCR access_token 已刷新');
    return this.cachedToken;
  }

  private parseNumber(raw: string | undefined, fallback: number) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface ClicksignSigner {
  role: string;
  name: string;
  email: string;
  signerToken: string; // gerado pelo backend; espelhado em CrmSignature.token
}

export interface CreateEnvelopeInput {
  documentName: string;
  documentBase64Pdf?: string;
  documentUrl?: string; // se PDF já está hospedado em URL pública (signed URL)
  signers: ClicksignSigner[];
  note?: string;
}

export interface CreateEnvelopeResult {
  envelopeId: string;
  envelopeUrl: string;
  provider: 'clicksign' | 'mock';
}

/**
 * Cliente fino do Clicksign. Em produção bate na API real
 * (https://app.clicksign.com/api/v1/...). Em dev/test, se
 * CLICKSIGN_API_TOKEN não estiver setado OU NODE_ENV === 'test', usa um
 * mock determinístico para que E2E e CI não dependam de credenciais.
 *
 * Não persistimos nada aqui — apenas falamos com a API externa. A
 * persistência (CrmSignature, CrmContract.externalEnvelopeId) é
 * responsabilidade do CrmSignaturesService.
 */
@Injectable()
export class ClicksignClient {
  private readonly logger = new Logger(ClicksignClient.name);
  private http: AxiosInstance | null = null;

  constructor(private readonly config: ConfigService) {}

  /** True quando estamos rodando contra a API real. */
  isLive(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    const token = this.config.get<string>('CLICKSIGN_API_TOKEN');
    return Boolean(token && token.trim().length > 0);
  }

  private getClient(): AxiosInstance {
    if (this.http) return this.http;
    const baseURL =
      this.config.get<string>('CLICKSIGN_BASE_URL') ??
      'https://app.clicksign.com/api/v1';
    const token = this.config.get<string>('CLICKSIGN_API_TOKEN') ?? '';
    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: { Accept: 'application/json' },
      params: { access_token: token },
    });
    return this.http;
  }

  async createEnvelope(input: CreateEnvelopeInput): Promise<CreateEnvelopeResult> {
    if (!this.isLive()) {
      const fake = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.logger.warn(
        `[mock] Clicksign envelope skipped (no CLICKSIGN_API_TOKEN or test env). Returning mock envelope ${fake}.`,
      );
      return {
        envelopeId: fake,
        envelopeUrl: `https://mock.clicksign.local/envelopes/${fake}`,
        provider: 'mock',
      };
    }
    const client = this.getClient();
    // Doc upload (POST /documents). PDF base64 OU URL.
    let documentKey: string;
    if (input.documentBase64Pdf) {
      const docResp = await client.post('/documents', {
        document: {
          path: `/${input.documentName}.pdf`,
          content_base64: input.documentBase64Pdf,
          deadline_at: null,
          auto_close: true,
          locale: 'pt-BR',
        },
      });
      documentKey = docResp.data?.document?.key;
    } else if (input.documentUrl) {
      const docResp = await client.post('/documents', {
        document: {
          path: `/${input.documentName}.pdf`,
          content_url: input.documentUrl,
          locale: 'pt-BR',
        },
      });
      documentKey = docResp.data?.document?.key;
    } else {
      throw new Error('createEnvelope requires documentBase64Pdf or documentUrl');
    }
    if (!documentKey) throw new Error('Clicksign returned no document key');

    // Add signers (POST /signers + /lists para cada).
    for (const s of input.signers) {
      const signerResp = await client.post('/signers', {
        signer: {
          email: s.email,
          name: s.name,
          documentation: '',
          birthday: '',
          phone_number: '',
          auths: ['email'],
        },
      });
      const signerKey = signerResp.data?.signer?.key;
      if (!signerKey) continue;
      await client.post('/lists', {
        list: {
          document_key: documentKey,
          signer_key: signerKey,
          sign_as: s.role,
          message: input.note ?? null,
        },
      });
    }
    return {
      envelopeId: documentKey,
      envelopeUrl: `https://app.clicksign.com/documents/${documentKey}`,
      provider: 'clicksign',
    };
  }
}

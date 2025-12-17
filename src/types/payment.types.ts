import { Payment } from '@prisma/client';

export interface PaymentGatewayConfig {
  merchantId: string;
  sandbox: boolean;
}

export interface CreatePaymentRequest {
  amount: number;
  description: string;
  callbackUrl: string;
  email?: string;
  mobile?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaymentResponse {
  paymentUrl: string;
  authority: string;
  gatewayTxId?: string;
  message?: string;
}

export interface VerifyPaymentRequest {
  authority: string;
  amount?: number;
}

export interface VerifyPaymentResponse {
  refId: string;
  cardPan?: string;
  cardHash?: string;
  feeType?: string;
  fee?: number;
}

export interface IPaymentGateway {
  name: string;
  createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse>;
  verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse>;
}

export interface ZarinpalRequestResponse {
  data: {
    code: number;
    message: string;
    authority: string;
    fee_type: string;
    fee: number;
  };
  errors: any[];
}

export interface ZarinpalVerifyResponse {
  data: {
    code: number;
    message: string;
    card_hash: string;
    card_pan: string;
    ref_id: number;
    fee_type: string;
    fee: number;
  };
  errors: any[];
}

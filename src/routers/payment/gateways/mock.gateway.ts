import { BasePaymentGateway } from './base.gateway';
import {
  CreatePaymentRequest,
  CreatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
} from '../../../types/payment.types';

export class MockGateway extends BasePaymentGateway {
  name = 'mock';

  constructor() {
    super({ merchantId: 'mock', sandbox: true });
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const authority = `AUTH-${Date.now()}`;
    const paymentUrl = `https://mock.pay/StartPay/${authority}`;
    this.log('Mock createPayment', { authority, paymentUrl, request });
    return {
      authority,
      paymentUrl,
      message: 'Mock payment created',
    };
  }

  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    this.log('Mock verifyPayment', { request });
    return {
      refId: `REF-${Date.now()}`,
      cardPan: '1234-5678-****-****',
      cardHash: 'mock-hash',
      feeType: 'fixed',
      fee: 0,
    };
  }
}

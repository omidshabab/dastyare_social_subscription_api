import axios from 'axios';
import { BasePaymentGateway } from './base.gateway';
import {
  CreatePaymentRequest,
  CreatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  PaymentGatewayConfig,
} from '../../../../types/payment.types';
import { PaymentGatewayError } from '../../../../utils/errors';
import { env } from '../../../../config/env';

export class ZibalGateway extends BasePaymentGateway {
  name = 'zibal';

  private requestUrl: string;
  private verifyUrl: string;
  private gatewayUrl: string;

  constructor(config?: PaymentGatewayConfig) {
    const effectiveConfig: PaymentGatewayConfig = config || {
      merchantId: '',
      sandbox: env.ZIBAL.SANDBOX,
    };
    super(effectiveConfig);
    this.requestUrl = env.ZIBAL.REQUEST_URL;
    this.verifyUrl = env.ZIBAL.VERIFY_URL;
    this.gatewayUrl = env.ZIBAL.GATEWAY_URL;
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    try {
      this.log('Creating payment', {
        amount: request.amount,
        description: request.description,
      });

      const body = {
        merchant: this.config.merchantId,
        amount: request.amount,
        callbackUrl: request.callbackUrl,
        description: request.description,
        mobile: request.mobile,
        email: request.email,
        ...request.metadata,
      };

      const response = await axios.post(this.requestUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      const data = response.data;

      if (!data || data.result !== 100 || !data.trackId) {
        throw new PaymentGatewayError(
          data?.message || 'Failed to create payment',
          data?.result
        );
      }

      const authority = String(data.trackId);
      const paymentUrl = `${this.gatewayUrl}${authority}`;

      this.log('Payment created successfully', {
        authority,
        paymentUrl,
      });

      return {
        authority,
        paymentUrl,
        gatewayTxId: authority,
        message: data.message,
      };
    } catch (error: any) {
      this.log('Payment creation failed', { error: error.message });
      if (error instanceof PaymentGatewayError) {
        throw error;
      }
      throw new PaymentGatewayError(
        error.response?.data?.message || error.message || 'Payment creation failed'
      );
    }
  }

  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    try {
      this.log('Verifying payment', {
        authority: request.authority,
        amount: request.amount,
      });

      const body = {
        merchant: this.config.merchantId,
        trackId: request.authority,
      };

      const response = await axios.post(this.verifyUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });

      const data = response.data;

      if (!data || data.result !== 100) {
        throw new PaymentGatewayError(
          data?.message || 'Payment verification failed',
          data?.result
        );
      }

      this.log('Payment verified successfully', {
        refNumber: data.refNumber,
        cardNumber: data.cardNumber,
      });

      return {
        refId: String(data.refNumber || ''),
        cardPan: data.cardNumber,
      };
    } catch (error: any) {
      this.log('Payment verification failed', { error: error.message });
      if (error instanceof PaymentGatewayError) {
        throw error;
      }
      throw new PaymentGatewayError(
        error.response?.data?.message || error.message || 'Payment verification failed'
      );
    }
  }
}

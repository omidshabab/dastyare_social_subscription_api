import axios from 'axios';
import { BasePaymentGateway } from './base.gateway';
import {
  CreatePaymentRequest,
  CreatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  PaymentGatewayConfig,
  ZarinpalRequestResponse,
  ZarinpalVerifyResponse,
} from '../../../../types/payment.types';
import { PaymentGatewayError } from '../../../../utils/errors';
import { env } from '../../../../config/env';

/**
 * Zarinpal Payment Gateway Implementation
 * 
 * Zarinpal is one of Iran's most popular payment gateways. This class handles
 * all interactions with Zarinpal's API, including creating payment requests
 * and verifying completed payments.
 * 
 * The implementation follows Zarinpal's v4 API documentation:
 * https://docs.zarinpal.com/paymentGateway/
 */
export class ZarinpalGateway extends BasePaymentGateway {
  name = 'zarinpal';
  
  // API endpoints for Zarinpal
  private requestUrl: string;
  private verifyUrl: string;
  private gatewayUrl: string;

  constructor(config?: PaymentGatewayConfig) {
    super(config || { merchantId: '', sandbox: env.ZARINPAL.SANDBOX });

    // Set URLs based on sandbox mode
    this.requestUrl = env.ZARINPAL.REQUEST_URL;
    this.verifyUrl = env.ZARINPAL.VERIFY_URL;
    this.gatewayUrl = env.ZARINPAL.GATEWAY_URL;
  }

  /**
   * Creates a payment request with Zarinpal
   * 
   * This method sends a request to Zarinpal to create a new payment.
   * If successful, Zarinpal returns an authority (unique payment reference)
   * and we construct a payment URL that the user can visit to complete payment.
   * 
   * @param request - Payment details including amount and callback URL
   * @returns Payment URL and authority for tracking
   */
  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    try {
      this.log('Creating payment', {
        amount: request.amount,
        description: request.description,
      });

      // Prepare the request body according to Zarinpal API v4
      const requestBody = {
        merchant_id: this.config.merchantId,
        amount: request.amount, // Amount in Rials
        description: request.description,
        callback_url: request.callbackUrl,
        metadata: {
          email: request.email,
          mobile: request.mobile,
          ...request.metadata,
        },
      };

      // Make HTTP request to Zarinpal
      const response = await axios.post<ZarinpalRequestResponse>(
        this.requestUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );

      const { data } = response.data;

      // Check if the request was successful (code 100 means success in Zarinpal)
      if (data.code !== 100 || !data.authority) {
        throw new PaymentGatewayError(
          data.message || 'Failed to create payment',
          data.code
        );
      }

      // Construct the payment URL where user will be redirected
      const paymentUrl = `${this.gatewayUrl}${data.authority}`;

      this.log('Payment created successfully', {
        authority: data.authority,
        paymentUrl,
      });

      return {
        authority: data.authority,
        paymentUrl,
        message: data.message,
      };
    } catch (error: any) {
      this.log('Payment creation failed', { error: error.message });
      
      // If it's already a PaymentGatewayError, rethrow it
      if (error instanceof PaymentGatewayError) {
        throw error;
      }

      // Otherwise, wrap it in a PaymentGatewayError
      throw new PaymentGatewayError(
        error.response?.data?.data?.message || error.message || 'Payment creation failed'
      );
    }
  }

  /**
   * Verifies a completed payment with Zarinpal
   * 
   * After the user completes payment on Zarinpal's website, they're redirected
   * back to our callback URL. We then call this method to verify the payment
   * was actually completed and get a reference ID for our records.
   * 
   * Important: The amount must match exactly what was used in createPayment
   * 
   * @param request - Authority and amount to verify
   * @returns Verification result with reference ID if successful
   */
  async verifyPayment(request: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
    try {
      this.log('Verifying payment', {
        authority: request.authority,
        amount: request.amount,
      });

      // Prepare verification request body
      const requestBody = {
        merchant_id: this.config.merchantId,
        amount: request.amount,
        authority: request.authority,
      };

      // Make HTTP request to verify the payment
      const response = await axios.post<ZarinpalVerifyResponse>(
        this.verifyUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );

      const { data } = response.data;

      // Code 100 or 101 means successful payment
      // 101 means payment was already verified (duplicate verification attempt)
      if (data.code !== 100 && data.code !== 101) {
        throw new PaymentGatewayError(
          data.message || 'Payment verification failed',
          data.code
        );
      }

      this.log('Payment verified successfully', {
        refId: data.ref_id,
        cardPan: data.card_pan,
      });

      return {
        refId: data.ref_id?.toString(),
        cardPan: data.card_pan,
        cardHash: data.card_hash,
        feeType: data.fee_type,
        fee: data.fee,
      };
    } catch (error: any) {
      this.log('Payment verification failed', { error: error.message });

      if (error instanceof PaymentGatewayError) {
        throw error;
      }

      throw new PaymentGatewayError(
        error.response?.data?.data?.message || error.message || 'Payment verification failed'
      );
    }
  }
}

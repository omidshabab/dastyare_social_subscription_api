import {
  IPaymentGateway,
  CreatePaymentRequest,
  CreatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  PaymentGatewayConfig,
} from '../../../../types/payment.types';

/**
 * Abstract base class for payment gateways
 * 
 * This class defines the interface that all payment gateway implementations
 * must follow. By extending this class, we ensure consistency across all
 * payment providers while allowing each to implement their own specific logic.
 * 
 * The pattern used here is called the Strategy Pattern - it allows us to
 * swap different payment gateways without changing the rest of the application.
 */
export abstract class BasePaymentGateway implements IPaymentGateway {
  // Each gateway has a unique name (e.g., 'zarinpal', 'zibal')
  abstract name: string;
  
  // Configuration specific to each gateway
  protected config: PaymentGatewayConfig;

  constructor(config: PaymentGatewayConfig) {
    this.config = config;
  }

  /**
   * Creates a payment request and returns a payment URL
   * This method must be implemented by each specific gateway
   * 
   * @param request - Contains amount, description, and callback URL
   * @returns Payment URL and authority for tracking the payment
   */
  abstract createPayment(
    request: CreatePaymentRequest
  ): Promise<CreatePaymentResponse>;

  /**
   * Verifies a completed payment
   * This method must be implemented by each specific gateway
   * 
   * @param request - Contains authority and amount to verify
   * @returns Verification result with reference ID if successful
   */
  abstract verifyPayment(
    request: VerifyPaymentRequest
  ): Promise<VerifyPaymentResponse>;

  /**
   * Formats amount to the smallest currency unit
   * For IRR (Iranian Rial), this is already in the smallest unit
   * For currencies like USD, you'd multiply by 100 to convert to cents
   * 
   * @param amount - Amount in the main currency unit
   * @returns Amount in the smallest currency unit
   */
  protected formatAmount(amount: number): number {
    return amount;
  }

  /**
   * Logs gateway operations for debugging and monitoring
   * In production, you might want to send these to a logging service
   * 
   * @param operation - The operation being performed
   * @param data - Relevant data for the operation
   */
  protected log(operation: string, data: any): void {
    console.log(`[${this.name}] ${operation}:`, JSON.stringify(data, null, 2));
  }
}
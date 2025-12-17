import { IPaymentGateway } from '../../../../types/payment.types';
import { ZarinpalGateway } from './zarinpal.gateway';
import { MockGateway } from './mock.gateway';
import { ValidationError } from '../../../../utils/errors';

/**
 * Gateway Factory
 * 
 * This module acts as a factory for creating payment gateway instances.
 * Instead of directly instantiating gateways throughout the code, we use
 * this factory to get the right gateway based on a string identifier.
 * 
 * Benefits of this approach:
 * - Easy to add new gateways without changing existing code
 * - Centralized place to manage all gateway instances
 * - Type-safe way to get gateways
 */

// Registry of available payment gateways
const gatewayRegistry: Record<string, () => IPaymentGateway> = {
  zarinpal: () => new ZarinpalGateway(),
  mock: () => new MockGateway(),
  // Add more gateways here as you implement them:
  // zibal: () => new ZibalGateway(),
  // idpay: () => new IdPayGateway(),
};

/**
 * Gets a payment gateway instance by name
 * 
 * @param gatewayName - Name of the gateway (e.g., 'zarinpal', 'zibal')
 * @returns Instance of the requested payment gateway
 * @throws ValidationError if gateway is not supported
 */
export function getPaymentGateway(gatewayName: string): IPaymentGateway {
  const gatewayFactory = gatewayRegistry[gatewayName.toLowerCase()];
  
  if (!gatewayFactory) {
    throw new ValidationError(
      `Payment gateway '${gatewayName}' is not supported. Available gateways: ${Object.keys(gatewayRegistry).join(', ')}`
    );
  }

  return gatewayFactory();
}

/**
 * Gets a list of all supported gateway names
 * 
 * @returns Array of supported gateway names
 */
export function getSupportedGateways(): string[] {
  return Object.keys(gatewayRegistry);
}

// Export individual gateways for direct use if needed
export { ZarinpalGateway };

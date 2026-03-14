export interface WebhookPayload {
  transactionId: string;
  walletId: string;
  merchantId: string;
  paymentMethodId: string;
  orderId: string;
  txHash: string;
  transactionDate: Date;
  address: string;
  amount: number;
}

export enum WebhookStatus {
  success = 'success',
  failed = 'failed',
}

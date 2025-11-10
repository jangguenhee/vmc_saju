/**
 * TossPayments API Client
 *
 * Documentation: https://docs.tosspayments.com/
 */

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;
const API_BASE = 'https://api.tosspayments.com/v1';

if (!TOSS_SECRET_KEY) {
  console.warn('Missing TOSS_SECRET_KEY environment variable');
}

/**
 * Generate Basic Auth header for TossPayments API
 */
function getAuthHeader(): string {
  const encoded = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Approve payment (결제 승인)
 */
export async function approvePayment(
  paymentKey: string,
  orderId: string,
  amount: number
) {
  const response = await fetch(`${API_BASE}/payments/confirm`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[TossPayments] Payment approval failed:', data);
    throw new Error(data.message || 'Payment approval failed');
  }

  return data;
}

/**
 * Retrieve payment by orderId (결제 조회)
 */
export async function retrievePayment(orderId: string) {
  const response = await fetch(`${API_BASE}/payments/orders/${orderId}`, {
    method: 'GET',
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[TossPayments] Payment retrieval failed:', data);
    throw new Error(data.message || 'Payment retrieval failed');
  }

  return data;
}

/**
 * Cancel payment (결제 취소)
 */
export async function cancelPayment(
  paymentKey: string,
  cancelReason: string
) {
  const response = await fetch(`${API_BASE}/payments/${paymentKey}/cancel`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      cancelReason,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[TossPayments] Payment cancellation failed:', data);
    throw new Error(data.message || 'Payment cancellation failed');
  }

  return data;
}

/**
 * Issue billing key for subscription (빌링키 발급)
 */
export async function issueBillingKey(
  customerKey: string,
  authKey: string
) {
  const response = await fetch(`${API_BASE}/billing/authorizations/issue`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerKey,
      authKey,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[TossPayments] Billing key issue failed:', data);
    throw new Error(data.message || 'Billing key issue failed');
  }

  return data;
}

/**
 * Charge with billing key (빌링키로 결제)
 */
export async function chargeWithBillingKey(
  billingKey: string,
  customerKey: string,
  amount: number,
  orderId: string,
  orderName: string
) {
  const response = await fetch(`${API_BASE}/billing/${billingKey}`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customerKey,
      amount,
      orderId,
      orderName,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[TossPayments] Billing charge failed:', data);
    throw new Error(data.message || 'Billing charge failed');
  }

  return data;
}

/**
 * Delete billing key (빌링키 삭제)
 */
export async function deleteBillingKey(
  billingKey: string,
  customerKey: string
) {
  const response = await fetch(
    `${API_BASE}/billing/${billingKey}?customerKey=${customerKey}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: getAuthHeader(),
      },
    }
  );

  if (!response.ok) {
    const data = await response.json();
    console.error('[TossPayments] Billing key deletion failed:', data);
    throw new Error(data.message || 'Billing key deletion failed');
  }

  return { success: true };
}

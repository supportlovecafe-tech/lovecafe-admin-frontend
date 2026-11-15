/**
 * Standardized Payment Option & Source Formatter
 * Formats order transaction types into clean labels:
 * 'POS Cash', 'POS UPI', 'POS Card', 'APP Cash', 'APP UPI', 'APP Card'
 */

export interface PaymentDisplayInfo {
  label: string;
  shortLabel: string;
  channel: 'POS' | 'APP';
  method: 'Cash' | 'UPI' | 'Card' | 'Split' | 'Other';
  color: string;
  bg: string;
  border: string;
}

export function isOrderFromPos(order: any): boolean {
  if (!order) return false;
  
  // 1. Explicit POS payment methods
  if (typeof order.payment_method === 'string' && order.payment_method.toUpperCase().startsWith('POS_')) {
    return true;
  }
  
  // 2. Explicit POS flag on order or metadata
  if (order.is_pos === true || order.metadata?.is_pos === true) {
    return true;
  }
  
  // 3. Staff assignment (POS orders are initiated by staff members)
  if (order.staff_id || order.metadata?.staff_id || order.metadata?.staff_code) {
    return true;
  }
  
  // 4. Location strings indicating counter or POS
  const loc = (order.location || '').toLowerCase();
  if (loc.includes('counter') || loc.includes('pos')) {
    return true;
  }
  
  // 5. If location starts with "app", it is definitely from the customer app
  if (loc.startsWith('app,') || loc.startsWith('app ') || loc === 'app') {
    return false;
  }
  
  // Default to App if not identified as POS
  return false;
}

export function formatPaymentMethodLabel(order: any): string {
  return getPaymentDisplayInfo(order).label;
}

export function getPaymentDisplayInfo(order: any): PaymentDisplayInfo {
  if (!order) {
    return {
      label: 'Unknown',
      shortLabel: 'Unknown',
      channel: 'APP',
      method: 'Other',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.1)',
      border: '1px solid rgba(148, 163, 184, 0.25)'
    };
  }

  const isPos = isOrderFromPos(order);
  const rawMethod = (order.payment_method || '').toUpperCase().trim();
  const settledMode = (order.metadata?.settled_payment_mode || '').toUpperCase().trim();

  // ──────────────────────────────────────────────────────────
  // 1. POS ORDERS
  // ──────────────────────────────────────────────────────────
  if (isPos) {
    // POS Split (Cash + UPI)
    if (rawMethod === 'POS_SPLIT') {
      const splitCash = order.metadata?.split_cash;
      const splitUpi = order.metadata?.split_upi;
      const fullLabel = splitCash !== undefined && splitUpi !== undefined
        ? `POS Split (₹${splitCash} Cash + ₹${splitUpi} UPI)`
        : 'POS Split (Cash + UPI)';

      return {
        label: fullLabel,
        shortLabel: 'POS Split',
        channel: 'POS',
        method: 'Split',
        color: '#fbbf24', // Amber
        bg: 'rgba(245, 158, 11, 0.14)',
        border: '1px solid rgba(245, 158, 11, 0.35)'
      };
    }

    // POS Cash
    if (rawMethod === 'POS_CASH' || rawMethod === 'CASH' || settledMode === 'CASH') {
      return {
        label: 'POS Cash',
        shortLabel: 'POS Cash',
        channel: 'POS',
        method: 'Cash',
        color: '#4ade80', // Emerald Green
        bg: 'rgba(74, 222, 128, 0.14)',
        border: '1px solid rgba(74, 222, 128, 0.35)'
      };
    }

    // POS UPI
    if (rawMethod === 'POS_UPI' || rawMethod === 'UPI' || settledMode === 'UPI') {
      return {
        label: 'POS UPI',
        shortLabel: 'POS UPI',
        channel: 'POS',
        method: 'UPI',
        color: '#38bdf8', // Cyan / Sky Blue
        bg: 'rgba(56, 189, 248, 0.14)',
        border: '1px solid rgba(56, 189, 248, 0.35)'
      };
    }

    // POS Card
    if (rawMethod === 'POS_CARD' || rawMethod === 'CARD' || rawMethod === 'DEMO_CARD') {
      return {
        label: 'POS Card',
        shortLabel: 'POS Card',
        channel: 'POS',
        method: 'Card',
        color: '#c084fc', // Purple
        bg: 'rgba(192, 132, 252, 0.14)',
        border: '1px solid rgba(192, 132, 252, 0.35)'
      };
    }

    // POS Pay on Delivery / Pay Later
    if (rawMethod === 'PAY_ON_DELIVERY' || rawMethod === 'PAY_LATER') {
      const mode = settledMode === 'UPI' ? 'POS UPI' : 'POS Cash';
      return {
        label: mode,
        shortLabel: mode,
        channel: 'POS',
        method: settledMode === 'UPI' ? 'UPI' : 'Cash',
        color: settledMode === 'UPI' ? '#38bdf8' : '#4ade80',
        bg: settledMode === 'UPI' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(74, 222, 128, 0.14)',
        border: settledMode === 'UPI' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(74, 222, 128, 0.35)'
      };
    }

    // Fallback POS
    const cleaned = rawMethod.replace('POS_', '').replace('_', ' ');
    return {
      label: `POS ${cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()}`,
      shortLabel: `POS ${cleaned}`,
      channel: 'POS',
      method: 'Other',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      border: '1px solid rgba(148, 163, 184, 0.3)'
    };
  }

  // ──────────────────────────────────────────────────────────
  // 2. APP ORDERS
  // ──────────────────────────────────────────────────────────

  // APP UPI
  if (rawMethod === 'DEMO_UPI' || rawMethod === 'UPI' || rawMethod === 'ONLINE' || rawMethod === 'RAZORPAY') {
    return {
      label: 'APP UPI',
      shortLabel: 'APP UPI',
      channel: 'APP',
      method: 'UPI',
      color: '#38bdf8', // Cyan / Sky Blue
      bg: 'rgba(56, 189, 248, 0.14)',
      border: '1px solid rgba(56, 189, 248, 0.35)'
    };
  }

  // APP Card
  if (rawMethod === 'DEMO_CARD' || rawMethod === 'CARD') {
    return {
      label: 'APP Card',
      shortLabel: 'APP Card',
      channel: 'APP',
      method: 'Card',
      color: '#c084fc', // Purple
      bg: 'rgba(192, 132, 252, 0.14)',
      border: '1px solid rgba(192, 132, 252, 0.35)'
    };
  }

  // APP Cash (Pay on Delivery, Cash, Pay Later)
  if (rawMethod === 'PAY_ON_DELIVERY' || rawMethod === 'PAY_LATER' || rawMethod === 'CASH' || rawMethod === 'COD') {
    // If settled upon delivery via runner with UPI, show APP UPI, otherwise APP Cash
    const finalMethod = settledMode === 'UPI' ? 'APP UPI' : 'APP Cash';
    return {
      label: finalMethod,
      shortLabel: finalMethod,
      channel: 'APP',
      method: settledMode === 'UPI' ? 'UPI' : 'Cash',
      color: settledMode === 'UPI' ? '#38bdf8' : '#f59e0b', // Amber / Orange for cash collection
      bg: settledMode === 'UPI' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(245, 158, 11, 0.14)',
      border: settledMode === 'UPI' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)'
    };
  }

  // Fallback App
  const cleaned = rawMethod.replace('DEMO_', '').replace('_', ' ');
  return {
    label: `APP ${cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase()}`,
    shortLabel: `APP ${cleaned}`,
    channel: 'APP',
    method: 'Other',
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.3)'
  };
}


declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open: () => void }
  }
}

type RazorpayOptions = {
  key: string
  order_id: string
  amount: number
  currency: 'INR'
  name: string
  description: string
  theme: { color: string }
  config: {
    display: {
      blocks: {
        upi: {
          name: string
          instruments: { method: 'upi'; flows: ['qr'] }[]
        }
      }
      sequence: ['block.upi']
      preferences: { show_default_blocks: false }
    }
  }
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void
  modal: { ondismiss: () => void }
}

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'))
    document.body.appendChild(s)
  })
}

type Checkout = {
  key: string
  orderId: string
  amountPaise: number
  onClose: () => void
}

export function checkoutOptions({ key, orderId, amountPaise, onClose }: Checkout): RazorpayOptions {
  return {
    key,
    order_id: orderId,
    amount: amountPaise,
    currency: 'INR',
    name: 'ACE Engineering College Canteen',
    description: 'UPI QR canteen order payment',
    theme: { color: '#d97706' },
    config: {
      display: {
        blocks: {
          upi: {
            name: 'Pay with UPI QR',
            instruments: [{ method: 'upi', flows: ['qr'] }],
          },
        },
        sequence: ['block.upi'],
        preferences: { show_default_blocks: false },
      },
    },
    // A checkout callback is not proof of payment. The signed webhook alone
    // changes the order to PAID; callbacks only take the student to tracking.
    handler: onClose,
    modal: { ondismiss: onClose },
  }
}

// Both callbacks only send the student to the order page. The order is marked
// paid by the webhook, never by anything the browser reports.
export async function openCheckout({ key, orderId, amountPaise, onClose }: Checkout) {
  await loadScript()
  new window.Razorpay(checkoutOptions({ key, orderId, amountPaise, onClose })).open()
}

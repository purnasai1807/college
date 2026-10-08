declare global {
  interface Window {
    Razorpay: any
  }
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

// Both callbacks only send the student to the order page. The order is marked
// paid by the webhook, never by anything the browser reports.
export async function openCheckout({ key, orderId, amountPaise, onClose }: Checkout) {
  await loadScript()
  new window.Razorpay({
    key,
    order_id: orderId,
    amount: amountPaise,
    currency: 'INR',
    name: 'College Canteen',
    theme: { color: '#d97706' },
    handler: onClose,
    modal: { ondismiss: onClose },
  }).open()
}

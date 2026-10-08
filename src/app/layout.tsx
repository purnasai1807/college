import './globals.css'

export const metadata = { title: 'College Canteen', description: 'Order ahead, pay by UPI, skip the queue.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  )
}

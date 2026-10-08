export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-amber-700">Page not found</p>
      <h1 className="mt-2 text-2xl font-semibold">We couldn’t find that canteen page.</h1>
      <a href="/" className="mt-5 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600">
        Back to the menu
      </a>
    </main>
  )
}

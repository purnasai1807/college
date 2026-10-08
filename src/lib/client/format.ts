export const inr = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN')

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })

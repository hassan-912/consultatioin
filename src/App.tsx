import { useEffect } from 'react'

export default function App() {
  useEffect(() => {
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
  }, [])
  return <main className="p-6 font-display text-slate">MG International</main>
}

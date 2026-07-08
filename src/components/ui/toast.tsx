import * as ToastPrimitive from '@radix-ui/react-toast'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ToastData {
  id: number
  title: string
  description?: string
  variant?: 'default' | 'success' | 'destructive'
}

interface ToastContextValue {
  toast: (t: Omit<ToastData, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 0

const variantClasses = {
  default: 'border bg-card text-card-foreground',
  success: 'border-emerald-800 bg-emerald-950 text-emerald-100',
  destructive: 'border-red-900 bg-red-950 text-red-100',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const toast = useCallback((t: Omit<ToastData, 'id'>) => {
    const id = ++nextId
    setToasts((prev) => [...prev.slice(-2), { ...t, id }])
  }, [])

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={2500}>
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(open) => !open && dismiss(t.id)}
            className={cn(
              'animate-toast-in rounded-lg p-4 shadow-lg',
              variantClasses[t.variant ?? 'default'],
            )}
          >
            <ToastPrimitive.Title className="text-sm font-semibold">{t.title}</ToastPrimitive.Title>
            {t.description && (
              <ToastPrimitive.Description className="mt-1 text-xs opacity-80">
                {t.description}
              </ToastPrimitive.Description>
            )}
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex w-72 flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { loadPlans, removeStoredPlan, storePlan, type Plan } from '@/lib/plans'

interface PlansContextValue {
  plans: Plan[]
  savePlan: (plan: Plan) => void
  /** Deletes a custom plan; resets a default plan to its shipped version. */
  deletePlan: (id: string) => void
}

const PlansContext = createContext<PlansContextValue | null>(null)

export function PlansProvider({ children }: { children: ReactNode }) {
  const [plans, setPlans] = useState<Plan[]>(loadPlans)

  const savePlan = useCallback((plan: Plan) => {
    storePlan(plan)
    setPlans(loadPlans())
  }, [])

  const deletePlan = useCallback((id: string) => {
    removeStoredPlan(id)
    setPlans(loadPlans())
  }, [])

  return (
    <PlansContext.Provider value={{ plans, savePlan, deletePlan }}>
      {children}
    </PlansContext.Provider>
  )
}

export function usePlans(): PlansContextValue {
  const ctx = useContext(PlansContext)
  if (!ctx) throw new Error('usePlans must be used within PlansProvider')
  return ctx
}

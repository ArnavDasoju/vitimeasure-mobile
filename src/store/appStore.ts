import { create } from 'zustand'

type AppStore = {
  userId: string | null
  userEmail: string | null
  userName: string | null
  signedIn: boolean
  onboardingDone: boolean
  sessionExpired: boolean
  isSyncing: boolean

  setUserId: (id: string) => void
  setUserEmail: (email: string | null) => void
  setUserName: (name: string | null) => void
  setSignedIn: (v: boolean) => void
  setOnboardingDone: (v: boolean) => void
  setSessionExpired: (v: boolean) => void
  setIsSyncing: (v: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  userId: null,
  userEmail: null,
  userName: null,
  signedIn: false,
  onboardingDone: false,
  sessionExpired: false,
  isSyncing: false,

  setUserId: (id) => set({ userId: id }),
  setUserEmail: (email) => set({ userEmail: email }),
  setUserName: (name) => set({ userName: name }),
  setSignedIn: (v) => set({ signedIn: v }),
  setOnboardingDone: (v) => set({ onboardingDone: v }),
  setSessionExpired: (v) => set({ sessionExpired: v }),
  setIsSyncing: (v) => set({ isSyncing: v }),
}))

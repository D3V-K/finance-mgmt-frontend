import { create } from 'zustand'

type UiState = {
  isMobileNavOpen: boolean
  activeModal: string | null
  openMobileNav: () => void
  closeMobileNav: () => void
  openModal: (name: string) => void
  closeModal: () => void
}

export const useUiStore = create<UiState>((set) => ({
  isMobileNavOpen: false,
  activeModal: null,
  openMobileNav: () => set({ isMobileNavOpen: true }),
  closeMobileNav: () => set({ isMobileNavOpen: false }),
  openModal: (activeModal) => set({ activeModal }),
  closeModal: () => set({ activeModal: null }),
}))

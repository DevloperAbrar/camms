import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      role: null,
      schoolId: null,
      setAuth: (user) => set({ user, role: user?.role, schoolId: user?.schoolId }),
      clearAuth: () => set({ user: null, role: null, schoolId: null }),
    }),
    { name: 'amms-auth' }
  )
);

export default useAuthStore;
import { create } from "zustand";

/**
 * Opens the floor's "Remove several" dialog from the property's Actions menu: the menu and the
 * floor view are separate parts of the page, and only the floor view knows which floor is shown.
 */
export const useRemoveSeveral = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

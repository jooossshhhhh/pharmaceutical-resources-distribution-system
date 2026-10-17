import { createContext } from "react";

export const ModalContainerContext = createContext({
  container: null,
  isModalOpen: false,
  setModalOpen: () => {},
  isViewActive: true,
  routePath: null,
});

export default ModalContainerContext;


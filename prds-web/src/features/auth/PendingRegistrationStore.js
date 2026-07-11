let pendingRegistration = null;

export const setPendingRegistration = (registration) => {
  pendingRegistration = registration;
};

export const getPendingRegistration = () => pendingRegistration;

export const clearPendingRegistration = () => {
  pendingRegistration = null;
};

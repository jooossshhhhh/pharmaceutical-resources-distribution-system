export const USER_ACCOUNT_LOG_MODULE = "User Account";

export const moduleAccess = {
  "/users": ["PHARMA_II"],
  "/suppliers": ["PHARMA_II"],
  "/facilities": ["PHARMA_I", "PHARMA_II"],
};

export const canAccessModule = (role, path) => {
  const allowedRoles = moduleAccess[path];

  if (!allowedRoles) {
    return true;
  }

  return allowedRoles.includes(role);
};

export const getAllowedNavItems = (items, role) => {
  return items.filter((item) => {
    if (item.roles?.length) {
      return item.roles.includes(role);
    }

    return canAccessModule(role, item.path);
  });
};

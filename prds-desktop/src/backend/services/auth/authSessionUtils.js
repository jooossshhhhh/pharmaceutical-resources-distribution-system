export const signOutCurrentSession = async (authClient) => {
  const { error } = await authClient.signOut({ scope: "local" });

  if (error) {
    throw error;
  }
};

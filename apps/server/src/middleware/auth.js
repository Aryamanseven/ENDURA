export function requireAuth(req, res, next) {
  // Clerk's clerkMiddleware() populates req.auth
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  req.user = { id: userId };
  return next();
}

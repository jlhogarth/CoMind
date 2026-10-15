# Supabase boundary

The browser client accepts only the project URL and publishable key. Its data access is constrained by database grants and Row Level Security.

Privileged metadata access is not implemented in browser code. Secret keys, service-role keys, database passwords, and direct connection strings belong only in a protected server environment after explicit authorization.

# Component boundary

OC-001 components render normalized schema and read-only row data. They do not own database credentials, construct privileged SQL, or execute mutations. Database access remains in library/provider boundaries so UI behavior cannot silently escalate privilege.

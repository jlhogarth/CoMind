export interface AdminExecutionConfig {
  token: string;
}

type Environment = Record<string, string | undefined>;

export function getAdminExecutionConfig(
  env: Environment = process.env,
): AdminExecutionConfig {
  if (env.OPERATOR_CONSOLE_ADMIN_ENABLED !== "true") {
    throw new Error("Operator Console administrative execution is disabled");
  }

  const token = env.OPERATOR_CONSOLE_ADMIN_TOKEN;
  if (!token || token.length < 32) {
    throw new Error("OPERATOR_CONSOLE_ADMIN_TOKEN must be configured with at least 32 characters");
  }

  return { token };
}

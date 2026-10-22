import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { CandidateIntakePage } from "@/modules/candidate-intake/presentation/pages/candidate-intake-page";

export function BatchImportPage(props: { user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  return <CandidateIntakePage {...props} initialMode="batch" />;
}

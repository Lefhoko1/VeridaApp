import { BusinessSetupScreen } from '@/modules/business';

// Once the business exists, the root guard moves the user into the workspace.
export default function SetupRoute() {
  return <BusinessSetupScreen />;
}

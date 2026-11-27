import { checkInstalledDependencies, reportStartupDependencyError } from './dependency-preflight.mjs';

try {
  checkInstalledDependencies();
  console.info('[Dependencies] Runtime package resolution verified.');
} catch (error) {
  reportStartupDependencyError(error);
  process.exitCode = 1;
}

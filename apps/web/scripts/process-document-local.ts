/**
 * Phase 09: 로컬 문서 처리 runner.
 *
 * Cloud Tasks/Cloud Run을 깨우지 않고, 운영자가 지정한 documentId 하나만 로컬에서 처리한다.
 */
import {
  applyEnvValues,
  assertRequiredLocalWorkerEnv,
  formatLocalRunnerErrorLog,
  loadLocalWorkerEnvFile,
  parseLocalRunnerArgs,
  runLocalDocumentProcessing,
} from "../src/lib/document/local-runner";

async function main(): Promise<void> {
  let summaryForError = null;
  try {
    const options = parseLocalRunnerArgs(process.argv.slice(2));
    const envFile = loadLocalWorkerEnvFile(options.envFile, process.cwd());
    applyEnvValues(envFile.values);
    // DB 연결보다 먼저 필수 env를 확인해 잘못된 로컬 실행이 production retry로 번지지 않게 한다.
    assertRequiredLocalWorkerEnv(envFile.path);

    const result = await runLocalDocumentProcessing(options);
    summaryForError = result.summary;

    if (result.status === "dry_run") {
      console.info(JSON.stringify(result.summary, null, 2));
      return;
    }

    console.info(JSON.stringify(result.log, null, 2));
  } catch (err) {
    console.error(JSON.stringify(formatLocalRunnerErrorLog(err, summaryForError), null, 2));
    process.exitCode = 1;
  }
}

main();

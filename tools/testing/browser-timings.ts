import { appendFileSync } from 'node:fs';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/** Keep browser cost visible in each shard's GitHub Actions summary. */
export default class BrowserTimings implements Reporter {
  private readonly tests: { name: string; project: string; milliseconds: number }[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    this.tests.push({
      name: test.title.replaceAll('|', '\\|').replaceAll('\n', ' '),
      project: test.parent.project()?.name ?? '',
      milliseconds: result.duration,
    });
  }

  onEnd(result: FullResult): void {
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (!summary) return;
    const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(1)}s`;
    const combined = this.tests.reduce((total, test) => total + test.milliseconds, 0);
    const slowest = [...this.tests].sort((left, right) => right.milliseconds - left.milliseconds);
    appendFileSync(
      summary,
      [
        '## Browser test timing',
        '',
        `${this.tests.length} test attempts (including retries); ${seconds(result.duration)} elapsed in the runner; ${seconds(combined)} combined test time.`,
        '',
        '| Test | Device | Time |',
        '| --- | --- | ---: |',
        ...slowest
          .slice(0, 10)
          .map((test) => `| ${test.name} | ${test.project} | ${seconds(test.milliseconds)} |`),
        '',
      ].join('\n'),
    );
  }
}

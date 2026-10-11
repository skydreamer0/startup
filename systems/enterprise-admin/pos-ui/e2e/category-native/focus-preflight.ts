import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withNativeContext, assertNativeFocus } from './native-context';

if (!process.env.CATEGORY_UI_OUTPUT || !process.env.CATEGORY_UI_NONCE || !/^:\d+$/.test(process.env.DISPLAY ?? '')) {
  throw new Error('Use the owned category runner and fresh Xvfb display');
}
async function main() {
  await withNativeContext(async context => {
    const receipt = await assertNativeFocus(context);
    writeFileSync(join(process.env.CATEGORY_UI_OUTPUT!, 'native-focus-driver.json'), JSON.stringify({
      nonce: process.env.CATEGORY_UI_NONCE, browserVersion: context.browser()!.version(),
      scope: 'about:blank native visibility prerequisite only; no app/API/database acceptance', ...receipt,
    }, null, 2) + '\n', { flag: 'wx' });
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });

# Local Nano runner

Install once with `npm ci --prefix tools/nano` from the repository root.

```sh
node tools/nano/run.mjs --prompt "Reply with the word OK"
node tools/nano/run.mjs --prompt "Describe this image in 5 words" --image gate0/sdk-probe/sample.png
node tools/nano/run.mjs --prompt 'Return an object with answer OK' --schema tools/nano/example-schema.json
node tools/nano/run.mjs --batch prompts.json
NANO_HEADFUL=1 node tools/nano/run.mjs --prompt 'Reply OK'
```

`--batch` reads a JSON array of objects with `prompt`, optional `system`, `imagePath`, `schema`, `temperature`, and `topK`. Image paths are relative to the calling directory. One JSON line is emitted per result; download progress goes to stderr. Do not run multiple processes against the profile concurrently.

```js
import {createNanoSession, runNano} from './tools/nano/run.mjs';
const session = await createNanoSession({headless:false, timeoutMs:2400000});
try {
  const results = await session.run([{prompt:'Reply OK'}, {prompt:'Reply YES'}]);
} finally {
  await session.close();
}
```

Each prompt creates and destroys a fresh LanguageModel session. `ms` includes model creation and inference, and the initial download if needed. Numeric sampling parameters are experimental in web contexts; Chrome 158 documents them as extension-only unless the legacy feature is enabled. See `gate0/NANO_NOTES.md` for the current blocker: this installation has not reached `available`.

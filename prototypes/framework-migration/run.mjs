/** THROWAWAY migration comparison. One command installs and starts both experiments. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const children = [];
for (const name of ['sveltekit', 'solidstart']) {
  const cwd = fileURLToPath(new URL(`./${name}/`, import.meta.url));
  await new Promise((resolve, reject) => {
    const install = spawn('npm', ['ci', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit' });
    install.on('exit', code => code === 0 ? resolve() : reject(new Error(`${name} install failed`)));
  });
  children.push(spawn('npm', ['run', 'dev'], { cwd, stdio: 'inherit' }));
}
console.log('SvelteKit: http://localhost:5181/wiki/\nSolidStart: http://localhost:5182/wiki/');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { children.forEach(child => child.kill(signal)); process.exit(); });

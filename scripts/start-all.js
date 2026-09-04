const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const PORT = 5000;
const args = process.argv.slice(2);

// Verifica si el puerto ya está en uso
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.once('connect', () => {
      client.destroy();
      resolve(true);
    });
    client.once('error', () => {
      client.destroy();
      resolve(false);
    });
    client.connect(port, '127.0.0.1');
  });
}

async function main() {
  let serverProcess = null;

  const inUse = await checkPortInUse(PORT);
  if (inUse) {
    console.log(`\x1b[32m[Backend API]\x1b[0m Servidor Express ya activo en http://localhost:${PORT}`);
  } else {
    console.log(`\x1b[36m[Backend API]\x1b[0m Iniciando servidor Express en puerto ${PORT}...`);
    const serverScript = path.resolve(__dirname, '../../ControldeAccesosySanciones/Server/index.cjs');
    const envPath = path.resolve(__dirname, '../.env');

    serverProcess = spawn(
      process.execPath,
      ['-r', 'dotenv/config', serverScript, `dotenv_config_path=${envPath}`],
      {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
        shell: false,
      }
    );

    serverProcess.on('error', (err) => {
      console.warn(`\x1b[33m[Backend API Error]\x1b[0m No se pudo iniciar el servidor:`, err.message);
    });
  }

  // Iniciar Expo
  console.log(`\x1b[35m[Expo App]\x1b[0m Levantando aplicación móvil...`);
  const expoCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

  const expoProcess = spawn(expoCmd, ['expo', 'start', ...args], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });

  // Manejo de apagado limpio
  const cleanup = () => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
    if (expoProcess) {
      try {
        expoProcess.kill();
      } catch {}
    }
    process.exit();
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  expoProcess.on('close', (code) => {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch {}
    }
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('Error al inicializar entorno:', err);
});

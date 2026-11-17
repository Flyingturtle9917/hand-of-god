const localtunnel = require('localtunnel');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log('=======================================================');
    console.log('LOCALTUNNEL_URL:', tunnel.url);
    console.log('=======================================================');

    tunnel.on('close', () => {
      console.log('Tunnel was closed');
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });
  } catch (err) {
    console.error('Failed to create localtunnel:', err);
  }
})();

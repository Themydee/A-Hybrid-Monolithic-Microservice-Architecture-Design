import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const configDir = __dirname;
const privateKeyPath = path.join(configDir, 'jwt-private.pem');
const publicKeyPath = path.join(configDir, 'jwt-public.pem');

function generateKeys() {
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    console.log('JWT RS256 Key pair already exists.');
    return;
  }

  console.log('Generating RS256 2048-bit key pair for JWT signing...');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);

  console.log('Keys generated successfully:');
  console.log(' - Private:', privateKeyPath);
  console.log(' - Public:', publicKeyPath);
}

generateKeys();

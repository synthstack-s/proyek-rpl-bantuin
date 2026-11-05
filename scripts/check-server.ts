import http from 'http';

const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(`Server is running! HTTP status: ${res.statusCode}`);
    console.log('Response:', data);
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.log('Server is NOT running:', err.message);
  process.exit(0);
});

req.setTimeout(2000, () => {
  console.log('Server request timed out');
  req.destroy();
  process.exit(0);
});

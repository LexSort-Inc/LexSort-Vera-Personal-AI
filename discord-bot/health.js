// discord-bot/health.js
// Utility script to verify the health of the VERA Pro Discord Bot.
// Can be run locally to ping the active server.

const http = require('http');

const PORT = process.env.PORT || 3000;
const HEALTH_URL = `http://localhost:${PORT}/health`;

console.log(`🔍 Querying bot health check at: ${HEALTH_URL}`);

http.get(HEALTH_URL, (res) => {
  const { statusCode } = res;
  const contentType = res.headers['content-type'];

  let error;
  if (statusCode !== 200) {
    error = new Error(`Request Failed.\nStatus Code: ${statusCode}`);
  } else if (!/^application\/json/.test(contentType)) {
    error = new Error(`Invalid content-type.\nExpected application/json but received ${contentType}`);
  }

  if (error) {
    console.error(`❌ Health Check Failed: ${error.message}`);
    res.resume();
    process.exit(1);
  }

  res.setEncoding('utf8');
  let rawData = '';
  res.on('data', (chunk) => { rawData += chunk; });
  res.on('end', () => {
    try {
      const parsedData = JSON.parse(rawData);
      console.log('✅ Health Check Succeeded!');
      console.log(JSON.stringify(parsedData, null, 2));
      process.exit(0);
    } catch (e) {
      console.error(`❌ Error parsing response JSON: ${e.message}`);
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.error(`❌ Connection Failed: ${e.message}`);
  console.log('Ensure the bot server is running (`npm start` or `node tester-manager.js`) before running this test.');
  process.exit(1);
});
